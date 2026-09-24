import {
  type InternalReportingGrant,
  internalReportingGrantSchema,
} from "@workspace/fiscal-service/src/schemas/internalReporting.schemas.js";
import { ServiceError } from "@workspace/shared/http";
import type { FiscalWorkerEnv } from "./env.js";

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

/** Mesma verificação de `services/fiscal-service/src/routes/internalReporting.routes.ts`. */
export async function verifyReportingGrant(input: {
  env: FiscalWorkerEnv;
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
