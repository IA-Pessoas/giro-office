import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-850";
const organizationId = "10000000-0000-0000-0000-000000000001";
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

function signedGrant(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body?: unknown;
  organizationId?: string;
  requestId?: string;
  expiresAt?: number;
  secret?: string;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = input.body ?? {};
  const payload = {
    audience: "rh-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: input.organizationId ?? organizationId,
    request_id: input.requestId ?? requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: createHmac("sha256", input.secret ?? grantSecret)
      .update(grant)
      .digest("hex"),
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
      event: "rh-service.test",
      fallbackMessage: "Erro interno no rh-service.",
    }),
  );
  return { app, extract };
}

describe("rh internal reporting routes", () => {
  it("protege catálogo e extração sem token ou grant válido", async () => {
    const extract = vi.fn();
    const { app } = createApp(extract);
    const body = { source: "rh.requests", fields: ["title"], limit: 1 };

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
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    expect(extract).not.toHaveBeenCalled();
  });

  it("publica somente campos seguros e mantém chaves separadas no catálogo", async () => {
    const { app } = createApp();
    const signed = signedGrant({
      operation: "catalog",
      source: "rh.catalog",
      fields: [],
    });

    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    const requestSource = response.body.data.sources.find(
      (source: { key: string }) => source.key === "rh.requests",
    );
    const holidaySource = response.body.data.sources.find(
      (source: { key: string }) => source.key === "rh.holidays",
    );
    expect(requestSource.keys.map((field: { key: string }) => field.key)).toEqual([
      "requester_user_id",
      "assigned_to_user_id",
    ]);
    expect(requestSource.fields.map((field: { key: string }) => field.key)).toEqual([
      "title",
      "category",
      "urgency",
      "status",
      "created_at",
      "updated_at",
    ]);
    expect(holidaySource).toMatchObject({ key: "rh.holidays", keys: [] });
    expect(holidaySource.fields.map((field: { key: string }) => field.key)).toEqual([
      "name",
      "date",
    ]);
    expect(Object.keys(holidaySource)).toEqual([
      "key",
      "label",
      "module",
      "minimum_permission",
      "keys",
      "fields",
    ]);
    expect(
      [...holidaySource.keys, ...holidaySource.fields].map((field: { key: string }) => field.key),
    ).not.toContain("id");
  });

  it("encaminha a organização do grant e rejeita limite, fonte, campos e expiração inválidos", async () => {
    const extract = vi.fn().mockResolvedValue({ rows: [{ title: "Férias" }], reachedLimit: true });
    const { app } = createApp(extract);
    const body = { source: "rh.requests", fields: ["title"], limit: 1 };
    const signed = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });

    const success = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(success.body).toEqual({
      success: true,
      data: { rows: [{ title: "Férias" }], reachedLimit: true },
    });
    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: body.source,
      fields: body.fields,
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
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", expired.grant)
      .set("x-reports-grant-signature", expired.signature)
      .send(body)
      .expect(403);

    const tooLargeBody = { ...body, limit: 102 };
    const tooLarge = signedGrant({
      operation: "extract",
      source: tooLargeBody.source,
      fields: tooLargeBody.fields,
      body: tooLargeBody,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", tooLarge.grant)
      .set("x-reports-grant-signature", tooLarge.signature)
      .send(tooLargeBody)
      .expect(400);

    const unpublishedBody = { source: body.source, fields: ["id"], limit: 1 };
    const unpublished = signedGrant({
      operation: "extract",
      source: unpublishedBody.source,
      fields: unpublishedBody.fields,
      body: unpublishedBody,
    });
    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", unpublished.grant)
      .set("x-reports-grant-signature", unpublished.signature)
      .send(unpublishedBody)
      .expect(403);

    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("não aceita organização no payload nem grant assinado para outra requisição", async () => {
    const extract = vi.fn();
    const { app } = createApp(extract);
    const body = { source: "rh.requests", fields: ["title"], limit: 1 };
    const signed = signedGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      requestId: "outro-request",
    });

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send({ ...body, organization_id: "20000000-0000-0000-0000-000000000001" })
      .expect(400);

    expect(extract).not.toHaveBeenCalled();
  });
});
