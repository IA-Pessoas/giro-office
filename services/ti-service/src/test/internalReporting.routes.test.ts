import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const internalToken = "reports-internal-token-test";
const grantSecret = "reports-grant-secret-test";
const organizationId = "10000000-0000-4000-8000-000000000001";

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
  expiresAt?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = input.body ?? {};
  const payload = {
    version: 1,
    audience: "ti-service",
    operation: input.operation,
    source: input.source,
    organization_id: organizationId,
    fields: input.fields,
    request_id: "request-ti-stock",
    issued_at: issuedAt,
    expires_at: input.expiresAt ?? issuedAt + 60,
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
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
      env: { reportsInternalToken: internalToken, reportsGrantSecret: grantSecret },
      reportingService: { extract } as never,
    }),
  );
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "ti-service.test",
      fallbackMessage: "Erro interno no ti-service.",
    }),
  );
  return { app, extract };
}

describe("TI internal reporting routes", () => {
  it("protege catálogo e extração contra token, grant e expiração inválidos", async () => {
    const extract = vi.fn();
    const { app } = createApp(extract);
    const body = { source: "ti.stock", fields: ["name"], limit: 1 };

    await request(app).get("/internal/reporting/catalog").expect(403);
    await request(app).post("/internal/reporting/extract").send(body).expect(403);

    const signed = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "invalid")
      .set("x-request-id", "request-ti-stock")
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    const expired = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", "request-ti-stock")
      .set("x-reports-grant", expired.grant)
      .set("x-reports-grant-signature", expired.signature)
      .send(body)
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });

  it("publica somente campos seguros no catálogo e usa o organization_id do grant", async () => {
    const extract = vi.fn().mockResolvedValue({
      rows: [{ name: "Notebook", category: "Hardware" }],
      reachedLimit: false,
    });
    const { app } = createApp(extract);
    const catalogGrant = signedGrant({ operation: "catalog", source: "ti.catalog", fields: [] });

    const catalogResponse = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", "request-ti-stock")
      .set("x-reports-grant", catalogGrant.grant)
      .set("x-reports-grant-signature", catalogGrant.signature)
      .expect(200);

    expect(catalogResponse.body.data.sources[0]).toMatchObject({ key: "ti.stock" });
    expect(catalogResponse.body.data.sources[0]).not.toHaveProperty("keys");
    expect(
      catalogResponse.body.data.sources[0].fields.map((field: { key: string }) => field.key),
    ).toEqual(["name", "category", "location", "quantity", "description", "status"]);

    const body = { source: "ti.stock", fields: ["name", "category"], limit: 1 };
    const grant = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", "request-ti-stock")
      .set("x-reports-grant", grant.grant)
      .set("x-reports-grant-signature", grant.signature)
      .send(body)
      .expect(200);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", "request-ti-stock")
      .set("x-reports-grant", grant.grant)
      .set("x-reports-grant-signature", grant.signature)
      .send(body)
      .expect(403);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: "ti.stock",
      fields: ["name", "category"],
      limit: 1,
    });
  });
});
