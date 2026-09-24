import type { InternalReportingService } from "@workspace/pessoal-service/src/reporting/internalReportingService.js";
import { pessoalReportingCatalog } from "@workspace/pessoal-service/src/reporting/pessoalReportingCatalog.js";
import {
  type InternalReportingGrant,
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/pessoal-service/src/schemas/internalReporting.schemas.js";
import { parseWithZod, reportingQueryFields } from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { Context, Env, Hono } from "hono";
import type { PessoalWorkerEnv } from "./env.js";

export type PessoalReportingService = Pick<InternalReportingService, "extract">;

const INVALID_GRANT = "Grant de relatórios inválido.";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toHex(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("hex");
}

function equalText(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const actual = new TextEncoder().encode(left);
  const expected = new TextEncoder().encode(right);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

// ponytail: cópia do verificador de workers/fiscal-service/src/reporting.ts (há uma por
// Worker de origem); mover para @workspace/runtime quando alguém mexer no protocolo do grant.
/**
 * Mesma verificação de `services/pessoal-service/src/routes/internalReporting.routes.ts`,
 * exceto o token: o Node compara com INTERNAL_SERVICE_TOKEN; o Worker usa
 * REPORTS_INTERNAL_TOKEN, que é o que o reports-service envia.
 */
export async function verifyReportingGrant(input: {
  env: PessoalWorkerEnv;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): Promise<InternalReportingGrant> {
  const { REPORTS_INTERNAL_TOKEN: token, REPORTS_GRANT_SECRET: secret } = input.env;
  if (!token || !secret) {
    throw new ServiceError(503, "Reporting interno não configurado.");
  }
  if (!equalText(input.token, token)) throw new ServiceError(403, "Acesso negado.");
  if (!input.grant) throw new ServiceError(403, INVALID_GRANT);

  let payload: InternalReportingGrant;
  try {
    payload = internalReportingGrantSchema.parse(
      JSON.parse(Buffer.from(input.grant, "base64url").toString("utf8")),
    );
  } catch {
    throw new ServiceError(403, INVALID_GRANT);
  }
  if (Buffer.from(canonicalJson(payload)).toString("base64url") !== input.grant) {
    throw new ServiceError(403, INVALID_GRANT);
  }
  if (!equalText(input.signature, await hmacHex(input.grant, secret))) {
    throw new ServiceError(403, INVALID_GRANT);
  }

  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    payload.fields.length === input.fields.length &&
    payload.fields.every((field, index) => field === input.fields[index]);
  if (
    payload.operation !== input.operation ||
    payload.source !== input.source ||
    !fieldsMatch ||
    payload.request_id !== input.requestId ||
    payload.body_sha256 !== (await sha256Hex(canonicalJson(input.body))) ||
    payload.issued_at > now ||
    payload.expires_at <= now
  ) {
    throw new ServiceError(403, INVALID_GRANT);
  }
  return payload;
}

/** `/internal/reporting/*`: chamado pelo reports-service via Service Binding, sem gateway. */
export function registerReportingRoutes<E extends Env>(
  app: Hono<E>,
  deps: {
    env: (c: Context<E>) => PessoalWorkerEnv;
    withReportingService: <T>(
      c: Context<E>,
      callback: (service: PessoalReportingService) => Promise<T>,
    ) => Promise<T>;
  },
): void {
  const grantInput = (c: Context<E>) => ({
    env: deps.env(c),
    token: c.req.header(INTERNAL_SERVICE_TOKEN_HEADER),
    grant: c.req.header("x-reports-grant"),
    signature: c.req.header("x-reports-grant-signature"),
    requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant({
      ...grantInput(c),
      operation: "catalog",
      source: "pessoal.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(pessoalReportingCatalog));
  });

  app.post("/internal/reporting/extract", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json<unknown>();
    } catch {
      throw new ServiceError(400, "Dados inválidos.");
    }
    const body = parseWithZod(internalReportingExtractBodySchema, raw);
    const grant = await verifyReportingGrant({
      ...grantInput(c),
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const data = await deps.withReportingService(c, (service) =>
      service.extract({
        organizationId: grant.organization_id,
        source: body.source,
        fields: body.fields,
        limit: body.limit,
        ...(body.query ? { query: body.query } : {}),
      }),
    );
    return c.json(createSuccessResponse(data));
  });
}
