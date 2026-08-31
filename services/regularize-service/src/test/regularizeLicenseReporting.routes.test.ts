import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { INTERNAL_SERVICE_TOKEN_HEADER, REQUEST_ID_HEADER, ServiceError } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp, regularizeTestEnv } from "./regularizeTestUtils.js";

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

function signedGrant(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  organizationId?: string;
  requestId?: string;
  body?: unknown;
  expiresAt?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = input.body ?? {};
  const grantPayload = {
    audience: "regularize-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: input.organizationId ?? "10000000-0000-4000-8000-000000000001",
    request_id: input.requestId ?? "request-847",
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(grantPayload)).toString("base64url");
  return {
    grant,
    signature: createHmac("sha256", regularizeTestEnv.regularizeReportingGrantSecret)
      .update(grant)
      .digest("hex"),
  };
}

describe("regularize internal reporting routes", () => {
  it("rejects missing and invalid grants before extracting", async () => {
    const extract = vi.fn();
    const app = createTestApp({} as never, { extract } as never);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-847")
      .send({ source: "regularize.licenses", fields: ["has"], limit: 10 })
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-847")
      .set(REPORTS_GRANT_HEADER, "invalid")
      .set(REPORTS_GRANT_SIGNATURE_HEADER, "invalid")
      .send({ source: "regularize.licenses", fields: ["has"], limit: 10 })
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });

  it("retorna o catálogo com chaves internas separadas dos campos publicados", async () => {
    const app = createTestApp();
    const signed = signedGrant({
      operation: "catalog",
      source: "regularize.catalog",
      fields: [],
    });

    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-847")
      .set(REPORTS_GRANT_HEADER, signed.grant)
      .set(REPORTS_GRANT_SIGNATURE_HEADER, signed.signature)
      .expect(200);

    const source = response.body.data.sources[0];
    expect(source.keys.map((field: { key: string }) => field.key)).toEqual([
      "client_id",
      "responsible_id",
      "task_id",
    ]);
    expect(source.fields.map((field: { key: string }) => field.key)).toEqual([
      "has",
      "type_license",
      "protocol",
      "status",
      "current_situation",
      "urgency",
      "entry_date",
      "date_last_consultation",
      "due_date",
    ]);
    expect(source.fields.map((field: { key: string }) => field.key)).not.toContain("id");
  });

  it("encaminha a organização do grant e bloqueia projeção não publicada", async () => {
    const extract = vi.fn().mockImplementation(async ({ fields }: { fields: string[] }) => {
      if (fields.includes("id")) {
        throw new ServiceError(403, "Campo não publicado para relatórios.");
      }
      return { rows: [{ has: true }], reachedLimit: false };
    });
    const app = createTestApp({} as never, { extract } as never);
    const body = { source: "regularize.licenses", fields: ["has"], limit: 10 };
    const signed = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });

    const success = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-847")
      .set(REPORTS_GRANT_HEADER, signed.grant)
      .set(REPORTS_GRANT_SIGNATURE_HEADER, signed.signature)
      .send(body)
      .expect(200);

    expect(success.body).toEqual({
      success: true,
      data: { rows: [{ has: true }], reachedLimit: false },
    });
    expect(extract).toHaveBeenCalledWith({
      organizationId: "10000000-0000-4000-8000-000000000001",
      source: "regularize.licenses",
      fields: ["has"],
      limit: 10,
    });

    const unpublishedBody = { source: "regularize.licenses", fields: ["id"], limit: 10 };
    const unpublishedGrant = signedGrant({
      operation: "extract",
      source: unpublishedBody.source,
      fields: unpublishedBody.fields,
      body: unpublishedBody,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-847")
      .set(REPORTS_GRANT_HEADER, unpublishedGrant.grant)
      .set(REPORTS_GRANT_SIGNATURE_HEADER, unpublishedGrant.signature)
      .send(unpublishedBody)
      .expect(403);
  });
});
