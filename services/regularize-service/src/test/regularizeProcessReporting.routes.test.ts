import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { INTERNAL_SERVICE_TOKEN_HEADER, REQUEST_ID_HEADER } from "@workspace/shared";
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
  body?: unknown;
  organizationId?: string;
  expiresAt?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = input.body ?? {};
  const payload = {
    audience: "regularize-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: input.organizationId ?? "10000000-0000-4000-8000-000000000001",
    request_id: "request-848",
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: createHmac("sha256", regularizeTestEnv.regularizeReportingGrantSecret)
      .update(grant)
      .digest("hex"),
  };
}

function reportingHeaders(signed: { grant: string; signature: string }) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: regularizeTestEnv.regularizeReportingToken,
    [REQUEST_ID_HEADER]: "request-848",
    [REPORTS_GRANT_HEADER]: signed.grant,
    [REPORTS_GRANT_SIGNATURE_HEADER]: signed.signature,
  };
}

describe("regularize process reporting routes", () => {
  it("publica processos com campos aprovados e chaves internas separadas", async () => {
    const app = createTestApp();
    const signed = signedGrant({
      operation: "catalog",
      source: "regularize.catalog",
      fields: [],
    });

    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(reportingHeaders(signed))
      .expect(200);

    const source = response.body.data.sources.find(
      (candidate: { key: string }) => candidate.key === "regularize.processes",
    );
    expect(source.keys.map((field: { key: string }) => field.key)).toEqual([
      "client_pj_id",
      "client_pf_id",
      "responsible1_id",
      "responsible2_id",
      "responsible3_id",
      "task_id",
    ]);
    expect(source.fields.map((field: { key: string }) => field.key)).toEqual([
      "process_type",
      "entry_date",
      "completion_date",
      "expected_date",
      "status",
      "locking_type",
      "urgency",
      "locked",
      "client_name",
      "description",
      "observation",
      "financial_status",
      "responsible1_name",
      "responsible2_name",
      "responsible3_name",
      "entry_month",
      "completion_month",
    ]);
    expect(source.fields.map((field: { key: string }) => field.key)).not.toContain("cpf_cnpj");
  });

  it("encaminha o tenant do grant e bloqueia token ou grant expirado", async () => {
    const extract = vi.fn().mockResolvedValue({
      rows: [{ process_type: "Abertura", status: "Aberto" }],
      reachedLimit: true,
    });
    const app = createTestApp({} as never, { extract } as never);
    const body = {
      source: "regularize.processes",
      fields: ["process_type", "status"],
      limit: 1,
    };
    const signed = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      organizationId: "10000000-0000-4000-8000-000000000002",
    });

    const success = await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(signed))
      .send(body)
      .expect(200);

    expect(success.body).toEqual({
      success: true,
      data: {
        rows: [{ process_type: "Abertura", status: "Aberto" }],
        reachedLimit: true,
      },
    });
    expect(extract).toHaveBeenCalledWith({
      organizationId: "10000000-0000-4000-8000-000000000002",
      source: "regularize.processes",
      fields: ["process_type", "status"],
      limit: 1,
    });

    const expired = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set({
        ...reportingHeaders(expired),
        [INTERNAL_SERVICE_TOKEN_HEADER]: "wrong-token",
      })
      .send(body)
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(expired))
      .send(body)
      .expect(403);

    expect(extract).toHaveBeenCalledTimes(1);
  });
});
