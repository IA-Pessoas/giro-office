import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-834";
const organizationId = "00000000-0000-4000-8000-000000000001";

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

function signedGrant(input: { body: unknown; expiresAt?: number; signature?: string }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = input.body as { source?: string; fields?: string[] };
  const payload = {
    audience: "contabil-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: body.fields ?? [],
    issued_at: issuedAt,
    operation: body.source ? "extract" : "catalog",
    organization_id: organizationId,
    request_id: requestId,
    source: body.source ?? "contabil.catalog",
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: input.signature ?? createHmac("sha256", grantSecret).update(grant).digest("hex"),
  };
}

function createApp(
  extract = vi.fn().mockResolvedValue({ rows: [{ competence: "2026-01" }], reachedLimit: false }),
) {
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
      event: "contabil-service.test",
      fallbackMessage: "Erro interno no contabil-service.",
    }),
  );
  return { app, extract };
}

describe("internal reporting routes", () => {
  it("protege e publica catálogo sem chaves internas", async () => {
    const signed = signedGrant({ body: {} });
    const { app } = createApp();

    await request(app).get("/internal/reporting/catalog").expect(403);
    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(response.body.data.sources[0].key).toBe("contabil.control");
    expect(
      response.body.data.sources[0].fields.map((field: { key: string }) => field.key),
    ).not.toEqual(expect.arrayContaining(["client_id", "id", "notes"]));

    const relationship = response.body.data.sources.find(
      (source: { key: string }) => source.key === "contabil.relationship",
    );
    expect(relationship.fields.map((field: { key: string }) => field.key)).toEqual([
      "bidding",
      "chart_accounts",
      "tool",
      "system",
    ]);
    expect(relationship.keys.map((field: { key: string }) => field.key)).toEqual(["client_id"]);
    const responsibles = response.body.data.sources.find(
      (source: { key: string }) => source.key === "contabil.responsibles",
    );
    expect(responsibles.fields.map((field: { key: string }) => field.key)).toEqual([
      "customer_with_movement",
    ]);
    expect(responsibles.keys.map((field: { key: string }) => field.key)).toEqual([
      "client_id",
      "person_responsible_id",
      "posted_by_id",
    ]);
  });

  it("exige token, grant válido e usa organização assinada", async () => {
    const body = { source: "contabil.control", fields: ["competence"], limit: 1 };
    const signed = signedGrant({ body });
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
      organizationId,
      source: "contabil.control",
      fields: ["competence"],
      limit: 1,
    });
  });

  it("recusa expiração, assinatura inválida e projeção não publicada", async () => {
    const body = { source: "contabil.control", fields: ["client_id"], limit: 1 };
    const expired = signedGrant({ body, expiresAt: Math.floor(Date.now() / 1000) - 1 });
    const invalidSignature = signedGrant({ body, signature: "invalid" });
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

  it("extrai relacionamento contábil com grant e campos publicados", async () => {
    const body = {
      source: "contabil.relationship",
      fields: ["bidding", "chart_accounts", "tool", "system"],
      limit: 1,
    };
    const signed = signedGrant({ body });
    const { app, extract } = createApp();

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: "contabil.relationship",
      fields: ["bidding", "chart_accounts", "tool", "system"],
      limit: 1,
    });
  });

  it("extrai responsibles somente pelo campo publicado", async () => {
    const body = {
      source: "contabil.responsibles",
      fields: ["customer_with_movement"],
      limit: 1,
    };
    const signed = signedGrant({ body });
    const { app, extract } = createApp();

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: "contabil.responsibles",
      fields: ["customer_with_movement"],
      limit: 1,
    });
  });
});
