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

describe("regularize portfolio internal reporting route", () => {
  for (const source of ["regularize.clients", "regularize.client_groups"]) {
    it(`encaminha ${source} somente com a organização do grant`, async () => {
      const extract = vi.fn().mockResolvedValue({
        rows: [{ name: "Alfa", status: "Processo de Inativação" }],
        reachedLimit: false,
      });
      const other = { extract: vi.fn() };
      const body = { source, fields: ["name", "status"], limit: 5 };
      const { grant, signature } = signedGrant({ body });
      const app = createTestApp({} as never, other as never, other as never, undefined, {
        extract,
      } as never);

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
          data: {
            rows: [{ name: "Alfa", status: "Processo de Inativação" }],
            reachedLimit: false,
          },
        });

      expect(extract).toHaveBeenCalledWith({
        organizationId: "10000000-0000-4000-8000-000000000009",
        source,
        fields: ["name", "status"],
        limit: 5,
      });
      expect(other.extract).not.toHaveBeenCalled();
    });
  }

  it("não extrai a carteira sem o grant assinado de relatórios", async () => {
    const extract = vi.fn();
    const app = createTestApp({} as never, undefined, undefined, undefined, { extract } as never);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.regularizeReportingToken)
      .set(REQUEST_ID_HEADER, "request-849")
      .send({ source: "regularize.clients", fields: ["name"], limit: 5 })
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });
});
