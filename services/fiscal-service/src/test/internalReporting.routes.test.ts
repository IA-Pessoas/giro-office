import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-839";
const organizationId = "a0000000-0000-4000-8000-000000000001";

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

function signedGrant(body: unknown, expiresAt = Math.floor(Date.now() / 1000) + 60) {
  const bodyValue = body as { source?: string; fields?: string[] };
  const payload = {
    audience: "fiscal-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: expiresAt,
    fields: bodyValue.fields ?? [],
    issued_at: Math.floor(Date.now() / 1000),
    operation: bodyValue.source ? "extract" : "catalog",
    organization_id: organizationId,
    request_id: requestId,
    source: bodyValue.source ?? "fiscal.catalog",
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: createHmac("sha256", grantSecret).update(grant).digest("hex"),
  };
}

function createApp(extract = vi.fn().mockResolvedValue({ rows: [], reachedLimit: false })) {
  const app = express();
  app.use(express.json());
  app.use(
    "/internal",
    createInternalReportingRouter({
      env: {
        reportsInternalToken: "test-reports-internal-token",
        reportsGrantSecret: grantSecret,
      } as never,
      reportingService: { extract } as never,
    }),
  );
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "fiscal-service.test",
      fallbackMessage: "Erro interno no fiscal-service.",
    }),
  );
  return { app, extract };
}

describe("fiscal internal reporting routes", () => {
  it("protege o catálogo e não publica IDs nem relações", async () => {
    const signed = signedGrant({});
    const { app } = createApp();

    await request(app).get("/internal/reporting/catalog").expect(403);
    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(response.body.data.sources[0]).toMatchObject({
      key: "fiscal.ncm",
      module: "fiscal",
      keys: [],
    });
    expect(response.body.data.sources[0].fields.map((field: { key: string }) => field.key)).toEqual(
      expect.arrayContaining([
        "tax_regime",
        "ncm_code",
        "federal_taxation_type",
        "cst_pis_outgoing",
        "cst_cofins_outgoing",
        "product_group",
        "description",
        "validity_start_date",
        "validity_end_date",
      ]),
    );
    expect(
      response.body.data.sources[0].fields.map((field: { key: string }) => field.key),
    ).not.toContain("id");
  });

  it("exige token e grant válidos e usa a organização assinada", async () => {
    const body = { source: "fiscal.ncm", fields: ["ncm_code"], limit: 1 };
    const signed = signedGrant(body);
    const { app, extract } = createApp();

    await request(app).post("/internal/reporting/extract").send(body).expect(403);
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({
      organizationId: organizationId,
      source: "fiscal.ncm",
      fields: ["ncm_code"],
      limit: 1,
    });
  });

  it("recusa grant expirado, assinatura inválida e campo não publicado", async () => {
    const body = { source: "fiscal.ncm", fields: ["id"], limit: 1 };
    const expired = signedGrant(body, Math.floor(Date.now() / 1000) - 1);
    const invalidSignature = { ...signedGrant(body), signature: "invalid" };
    const { app, extract } = createApp();

    for (const signed of [expired, invalidSignature]) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(body)
        .expect(403);
    }
    expect(extract).not.toHaveBeenCalled();
  });
});
