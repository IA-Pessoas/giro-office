import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { FiscalServiceEnv } from "../config/env.js";
import { fiscalNcmReportingCatalog } from "../reporting/fiscalNcmReportingCatalog.js";
import type { InternalReportingService } from "../reporting/internalReportingService.js";
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

function bodyHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
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
  env: FiscalServiceEnv;
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

  const payload = decodeGrant(input.grant);
  const expectedSignature = createHmac("sha256", input.env.reportsGrantSecret)
    .update(input.grant ?? "")
    .digest("hex");
  if (!equalSecret(input.signature, expectedSignature)) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
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
    payload.body_sha256 !== bodyHash(input.body) ||
    payload.issued_at > now ||
    payload.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }

  return payload;
}

export function createInternalReportingRouter(options: {
  env: FiscalServiceEnv;
  reportingService: InternalReportingService;
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
      source: "fiscal.catalog",
      fields: [],
      body: {},
    });
    response.json(createSuccessResponse(fiscalNcmReportingCatalog));
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
    const result = await options.reportingService.extract({
      organizationId: grant.organization_id,
      source: body.source,
      fields: body.fields,
      limit: body.limit,
    });
    response.json(createSuccessResponse(result));
  });

  return router;
}
