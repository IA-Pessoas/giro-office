import { createHash, createHmac } from "node:crypto";

import type { ReportCatalogSource } from "../catalog/types.js";

export const MAX_REGULARIZE_REPORTING_LIMIT = 101;

export function publicReportingSources<T extends { keys?: unknown }>(
  sources: readonly T[],
): readonly ReportCatalogSource[] {
  return sources.map(
    ({ keys: _keys, ...source }) => source,
  ) as unknown as readonly ReportCatalogSource[];
}

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

export function createRegularizeReportingGrant(input: {
  secret: string;
  source: string;
  fields: readonly string[];
  organizationId: string;
  requestId: string;
  body: unknown;
}): { grant: string; signature: string } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "regularize-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: "extract",
    organization_id: input.organizationId,
    request_id: input.requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return { grant, signature: createHmac("sha256", input.secret).update(grant).digest("hex") };
}

export function isRegularizeExtractResponse(value: unknown): value is {
  success: true;
  data: { rows: readonly Record<string, unknown>[]; reachedLimit: boolean };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    Array.isArray((value as { data?: { rows?: unknown } }).data?.rows) &&
    typeof (value as { data?: { reachedLimit?: unknown } }).data?.reachedLimit === "boolean" &&
    (value as { data: { rows: unknown[] } }).data.rows.every(
      (row) => typeof row === "object" && row !== null && !Array.isArray(row),
    )
  );
}

export function projectRegularizeReportingRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
}
