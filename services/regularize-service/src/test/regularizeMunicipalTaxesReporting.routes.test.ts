import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
  REQUEST_ID_HEADER,
} from "@workspace/shared";
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

function signedGrant(input: { body: unknown; expiresAt?: number }) {
  const body = input.body as { source: string; fields: readonly string[] };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "regularize-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: body.fields,
    issued_at: issuedAt,
    operation: "extract",
    organization_id: "10000000-0000-4000-8000-000000000009",
    request_id: "request-849",
    source: body.source,
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

describe("regularize municipal taxes internal reporting route", () => {
  it("encaminha somente a organização do grant para a fonte municipal", async () => {
    const extract = vi.fn().mockResolvedValue({
      rows: [{ year: 2026, tff_amount: 123.45 }],
      reachedLimit: true,
    });
    const body = {
      source: REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
      fields: ["year", "tff_amount"],
      limit: 1,
    };
    const { grant, signature } = signedGrant({ body });
    const app = createTestApp({} as never, undefined, { extract } as never);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-849")
      .set(REPORTS_GRANT_HEADER, grant)
      .set(REPORTS_GRANT_SIGNATURE_HEADER, signature)
      .send(body)
      .expect(200)
      .expect({
        success: true,
        data: { rows: [{ year: 2026, tff_amount: 123.45 }], reachedLimit: true },
      });

    expect(extract).toHaveBeenCalledWith({
      organizationId: "10000000-0000-4000-8000-000000000009",
      source: "regularize.municipal_taxes",
      fields: ["year", "tff_amount"],
      limit: 1,
    });
  });

  it("rejeita fonte, limite e grant expirado antes de extrair", async () => {
    const extract = vi.fn();
    const app = createTestApp({} as never, undefined, { extract } as never);
    const body = {
      source: REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
      fields: ["year"],
      limit: 1,
    };
    const expired = signedGrant({ body, expiresAt: Math.floor(Date.now() / 1000) - 1 });

    await request(app)
      .post("/internal/reporting/extract")
      .send({ ...body, source: "regularize.invalid" })
      .expect(400);
    await request(app)
      .post("/internal/reporting/extract")
      .send({ ...body, limit: 102 })
      .expect(400);
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-849")
      .set(REPORTS_GRANT_HEADER, expired.grant)
      .set(REPORTS_GRANT_SIGNATURE_HEADER, expired.signature)
      .send(body)
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });
});
