import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { TiServiceEnv } from "../config/env.js";
import type { TiInternalReportingService } from "../reporting/tiInternalReportingService.js";
import {
  type InternalReportingGrant,
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "../schemas/internalReporting.schemas.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";

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

function equalSecret(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const actual = Buffer.from(left, "utf8");
  const expected = Buffer.from(right, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decodeGrant(value: string | undefined): InternalReportingGrant {
  if (!value) throw new ServiceError(403, "Grant de relatórios inválido.");
  try {
    const payload = internalReportingGrantSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (Buffer.from(canonicalJson(payload)).toString("base64url") !== value) {
      throw new ServiceError(403, "Grant de relatórios inválido.");
    }
    return payload;
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
}

function verifyGrant(input: {
  env: Pick<TiServiceEnv, "reportsInternalToken" | "reportsGrantSecret">;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): InternalReportingGrant {
  if (!equalSecret(input.token, input.env.reportsInternalToken)) {
    throw new ServiceError(403, "Acesso negado.");
  }
  const grant = input.grant ?? "";
  const payload = decodeGrant(input.grant);
  const expectedSignature = createHmac("sha256", input.env.reportsGrantSecret)
    .update(grant)
    .digest("hex");
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    payload.fields.length === input.fields.length &&
    payload.fields.every((field, index) => field === input.fields[index]);
  if (
    !equalSecret(input.signature, expectedSignature) ||
    payload.operation !== input.operation ||
    payload.source !== input.source ||
    !fieldsMatch ||
    payload.request_id !== input.requestId ||
    payload.body_sha256 !== createHash("sha256").update(canonicalJson(input.body)).digest("hex") ||
    payload.issued_at > now ||
    payload.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return payload;
}

export function createInternalReportingRouter(options: {
  env: Pick<TiServiceEnv, "reportsInternalToken" | "reportsGrantSecret">;
  reportingService: TiInternalReportingService;
}): ReturnType<typeof Router> {
  const router = Router();
  router.get("/reporting/catalog", (request, response) => {
    verifyGrant({
      env: options.env,
      token: request.get(INTERNAL_SERVICE_TOKEN_HEADER),
      grant: request.get(REPORTS_GRANT_HEADER),
      signature: request.get(REPORTS_GRANT_SIGNATURE_HEADER),
      requestId: request.get(REQUEST_ID_HEADER) ?? "",
      operation: "catalog",
      source: "ti.catalog",
      fields: [],
      body: {},
    });
    response.json(createSuccessResponse(options.reportingService.catalog));
  });
  router.post("/reporting/extract", async (request, response) => {
    const body = parseWithZod(internalReportingExtractBodySchema, request.body);
    const grant = verifyGrant({
      env: options.env,
      token: request.get(INTERNAL_SERVICE_TOKEN_HEADER),
      grant: request.get(REPORTS_GRANT_HEADER),
      signature: request.get(REPORTS_GRANT_SIGNATURE_HEADER),
      requestId: request.get(REQUEST_ID_HEADER) ?? "",
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });
    response.json(
      createSuccessResponse(
        await options.reportingService.extract({ organizationId: grant.organization_id, ...body }),
      ),
    );
  });
  return router;
}
