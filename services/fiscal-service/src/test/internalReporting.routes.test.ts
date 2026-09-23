import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-840";
const organizationId = "a0000000-0000-4000-8000-000000000001";
const internalToken = "test-reports-internal-token";

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
        reportsInternalToken: internalToken,
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
  it("protege o catálogo e publica ICMS e NCM sem IDs nem relações", async () => {
    const signed = signedGrant({});
    const { app } = createApp();

    await request(app).get("/internal/reporting/catalog").expect(403);
    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(response.body.data.sources.map((source: { key: string }) => source.key)).toEqual([
      "fiscal.icms",
      "fiscal.ncm",
      "fiscal.ipi",
    ]);
    expect(response.body.data.sources[0]).toMatchObject({
      key: "fiscal.icms",
      module: "fiscal",
      keys: [],
    });
    expect(response.body.data.sources[1]).toMatchObject({
      key: "fiscal.ncm",
      module: "fiscal",
      keys: [],
    });
    expect(response.body.data.sources[2]).toMatchObject({
      key: "fiscal.ipi",
      module: "fiscal",
      keys: [],
    });
    expect(response.body.data.relations).toEqual([]);
    expect(
      response.body.data.sources.flatMap((source: { fields: { key: string }[] }) =>
        source.fields.map((field) => field.key),
      ),
    ).not.toContain("id");
  });

  it.each([
    {
      source: "fiscal.icms",
      fields: ["state"],
    },
    {
      source: "fiscal.ncm",
      fields: ["ncm_code"],
    },
    {
      source: "fiscal.ipi",
      fields: ["ncm"],
    },
  ])("exige grant válido e encaminha a organização assinada para $source", async (input) => {
    const body = { ...input, limit: 1 };
    const signed = signedGrant(body);
    const { app, extract } = createApp();

    await request(app).post("/internal/reporting/extract").send(body).expect(403);
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: input.source,
      fields: input.fields,
      limit: 1,
    });
  });

  it("recusa grant expirado, assinatura inválida e limite acima do máximo", async () => {
    const body = { source: "fiscal.icms", fields: ["state"], limit: 1 };
    const expired = signedGrant(body, Math.floor(Date.now() / 1000) - 1);
    const invalidSignature = { ...signedGrant(body), signature: "invalid" };
    const { app, extract } = createApp();

    for (const signed of [expired, invalidSignature]) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(body)
        .expect(403);
    }

    const tooLargeBody = { ...body, limit: 50_002 };
    const tooLarge = signedGrant(tooLargeBody);
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", tooLarge.grant)
      .set("x-reports-grant-signature", tooLarge.signature)
      .send(tooLargeBody)
      .expect(400);

    expect(extract).not.toHaveBeenCalled();
  });

  it.each([100, 101, 102, 50_001])("aceita extração fiscal com limite %i", async (limit) => {
    const body = { source: "fiscal.icms", fields: ["state"], limit };
    const signed = signedGrant(body);
    const { app, extract } = createApp();

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: "fiscal.icms",
      fields: ["state"],
      limit,
    });
  });
});
