import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  parseWithZod,
  REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
  REQUEST_ID_HEADER,
  reportingQueryFields,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { RegularizeServiceEnv } from "../config/env.js";
import type {
  RegularizeLicenseReportingService,
  RegularizeMunicipalTaxesReportingService,
} from "../reporting/internalReportingService.js";
import { regularizeMunicipalTaxesReportingCatalog } from "../reporting/regularizeMunicipalTaxesReportingCatalog.js";
import { regularizeReportingCatalog as regularizeProcessesReportingCatalog } from "../reporting/regularizeReportingCatalog.js";
import {
  type InternalReportingGrant,
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "../schemas/internalReporting.schemas.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";
const regularizeReportingCatalog = {
  sources: [
    ...regularizeProcessesReportingCatalog.sources,
    ...regularizeMunicipalTaxesReportingCatalog.sources,
  ],
  relations: [],
} as const;

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
  env: Pick<RegularizeServiceEnv, "regularizeReportingToken" | "regularizeReportingGrantSecret">;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): InternalReportingGrant {
  if (!equalSecret(input.token, input.env.regularizeReportingToken)) {
    throw new ServiceError(403, "Acesso negado.");
  }

  const grant = input.grant ?? "";
  const payload = decodeGrant(input.grant);
  const expectedSignature = createHmac("sha256", input.env.regularizeReportingGrantSecret)
    .update(grant)
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
  env: Pick<RegularizeServiceEnv, "regularizeReportingToken" | "regularizeReportingGrantSecret">;
  reportingService: RegularizeLicenseReportingService;
  municipalTaxesReportingService: RegularizeMunicipalTaxesReportingService;
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
      source: "regularize.catalog",
      fields: [],
      body: {},
    });
    response.json(createSuccessResponse(regularizeReportingCatalog));
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
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const result =
      body.source === REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE
        ? await options.municipalTaxesReportingService.extract({
            organizationId: grant.organization_id,
            source: body.source,
            fields: body.fields,
            limit: body.limit,
            ...(body.query ? { query: body.query } : {}),
          })
        : await options.reportingService.extract({
            organizationId: grant.organization_id,
            source: body.source,
            fields: body.fields,
            limit: body.limit,
            ...(body.query ? { query: body.query } : {}),
          });
    response.json(createSuccessResponse(result));
  });

  return router;
}
