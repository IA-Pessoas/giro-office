import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-832";
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
    audience: "project-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: body.fields ?? [],
    issued_at: issuedAt,
    operation: body.source ? "extract" : "catalog",
    organization_id: organizationId,
    request_id: requestId,
    source: body.source ?? "integracao.catalog",
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: input.signature ?? createHmac("sha256", grantSecret).update(grant).digest("hex"),
  };
}

function createApp(
  extract = vi.fn().mockResolvedValue({ rows: [{ name: "Projeto A" }], reachedLimit: false }),
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
      event: "project-service.test",
      fallbackMessage: "Erro interno no project-service.",
    }),
  );
  return { app, extract };
}

describe("internal reporting routes", () => {
  it("encaminha critérios assinados e recusa adulteração", async () => {
    const body = {
      source: "integracao.projects",
      fields: ["name"],
      limit: 1,
      query: { filters: [{ field: "name", operator: "eq", parameter: "p", value: "Projeto 149" }] },
    };
    const signed = signedGrant({ body });
    const { app, extract } = createApp();
    const send = (payload: unknown) =>
      request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(payload);
    await send(body).expect(200);
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ query: body.query }));
    await send({ ...body, query: {} }).expect(403);
  });
  it("protege e publica catálogo somente com grant canônico", async () => {
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

    expect(response.body.data.sources[0].key).toBe("integracao.projects");
    expect(
      response.body.data.sources[0].fields.map((field: { key: string }) => field.key),
    ).not.toContain("client_id");
  });

  it("exige token e grant válido e usa somente a organização assinada", async () => {
    const body = { source: "integracao.projects", fields: ["name"], limit: 1 };
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
      source: "integracao.projects",
      fields: ["name"],
      limit: 1,
    });
  });

  it("recusa expiração, assinatura inválida e campo chave", async () => {
    const body = { source: "integracao.projects", fields: ["client_id"], limit: 1 };
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

  it("recusa grant HMAC com JSON não canônico", async () => {
    const body = { source: "integracao.projects", fields: ["name"], limit: 1 };
    const signed = signedGrant({ body });
    const payload = JSON.parse(Buffer.from(signed.grant, "base64url").toString("utf8"));
    const nonCanonicalGrant = Buffer.from(
      JSON.stringify(Object.fromEntries(Object.entries(payload).reverse())),
    ).toString("base64url");
    const signature = createHmac("sha256", grantSecret).update(nonCanonicalGrant).digest("hex");
    const { app, extract } = createApp();

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", nonCanonicalGrant)
      .set("x-reports-grant-signature", signature)
      .send(body)
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });

  it("vincula grant ao request id e ao corpo canônico", async () => {
    const body = { source: "integracao.projects", fields: ["name"], limit: 1 };
    const signed = signedGrant({ body });
    const { app, extract } = createApp();

    for (const [requestIdHeader, requestBody] of [
      ["outro-request", body],
      [requestId, { ...body, limit: 2 }],
    ] as const) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
        .set("x-request-id", requestIdHeader)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(requestBody)
        .expect(403);
    }

    expect(extract).not.toHaveBeenCalled();
  });
});
