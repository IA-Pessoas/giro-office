import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const internalToken = "test-reports-internal-token";
const organizationId = "00000000-0000-4000-8000-000000000002";
const requestId = "request-842";

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

function signedGrant(
  body: unknown,
  expiresAt = Math.floor(Date.now() / 1000) + 60,
  overrides: Record<string, unknown> = {},
) {
  const input = body as { fields?: string[]; source?: string };
  const payload = {
    audience: "pessoal-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: expiresAt,
    fields: input.fields ?? [],
    issued_at: Math.floor(Date.now() / 1000),
    operation: input.source ? "extract" : "catalog",
    organization_id: overrides.organization_id ?? organizationId,
    request_id: overrides.request_id ?? requestId,
    source: overrides.source ?? input.source ?? "pessoal.catalog",
    version: 1,
    ...overrides,
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
      env: { internalServiceToken: internalToken, reportsGrantSecret: grantSecret } as never,
      reportingService: { extract } as never,
    }),
  );
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "pessoal-service.test",
      fallbackMessage: "Erro interno no pessoal-service.",
    }),
  );
  return { app, extract };
}

describe("pessoal internal reporting routes", () => {
  it("protege o catálogo e publica somente campos seguros e chaves", async () => {
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

    expect(response.body.data.sources).toHaveLength(3);
    expect(response.body.data.sources[0]).toMatchObject({
      key: "pessoal.ldd",
      module: "pessoal",
      keys: [{ key: "client_id" }],
    });
    expect(response.body.data.sources[0].fields.map((field: { key: string }) => field.key)).toEqual(
      ["type", "period", "due_date", "balance_amount", "registration_status", "status"],
    );
    expect(
      response.body.data.sources[0].fields.map((field: { key: string }) => field.key),
    ).not.toContain("id");

    const payrollSource = response.body.data.sources.find(
      (source: { key: string }) => source.key === "pessoal.payroll",
    );
    expect(payrollSource).toMatchObject({
      module: "pessoal",
      keys: [{ key: "client_id" }, { key: "responsible_id" }, { key: "union_id" }],
    });
    expect(payrollSource.fields.map((field: { key: string }) => field.key)).toEqual([
      "advance",
      "advance_type",
      "advance_amount",
      "onvio",
      "group",
      "vt",
      "vt_value",
      "vt_type",
      "va",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "reinf",
      "employees",
    ]);
    expect(payrollSource.fields.map((field: { key: string }) => field.key)).not.toContain(
      "contact",
    );

    const obligationsSource = response.body.data.sources.find(
      (source: { key: string }) => source.key === "pessoal.obligations",
    );
    expect(obligationsSource).toMatchObject({
      module: "pessoal",
      keys: [{ key: "client_id" }, { key: "responsavel_id" }],
    });
    expect(obligationsSource.fields.map((field: { key: string }) => field.key)).toEqual([
      "competence",
      "advance",
      "payroll",
      "charges",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "va",
      "vt",
    ]);
  });

  it("valida token e grant e encaminha a organização assinada para obrigações", async () => {
    const body = { source: "pessoal.obligations", fields: ["competence"], limit: 1 };
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
      source: "pessoal.obligations",
      fields: ["competence"],
      limit: 1,
    });
  });

  it("recusa grant expirado, assinatura inválida e limite acima do máximo", async () => {
    const body = { source: "pessoal.ldd", fields: ["type"], limit: 1 };
    const expired = signedGrant(body, Math.floor(Date.now() / 1000) - 1);
    const invalidSignature = { ...signedGrant(body), signature: "invalid" };
    const incompatible = signedGrant(body, Math.floor(Date.now() / 1000) + 60, {
      audience: "reports-service",
    });
    const { app, extract } = createApp();

    for (const signed of [expired, invalidSignature, incompatible]) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(body)
        .expect(403);
    }

    const tooLargeBody = { ...body, limit: 102 };
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

  it("valida grant de payroll e preserva reachedLimit sem conteúdo sensível", async () => {
    const body = { source: "pessoal.payroll", fields: ["advance", "employees"], limit: 1 };
    const signed = signedGrant(body);
    const extract = vi.fn().mockResolvedValue({
      rows: [{ advance: true, employees: 12 }],
      reachedLimit: true,
    });
    const { app } = createApp(extract);

    const response = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(extract).toHaveBeenCalledWith({ organizationId, ...body });
    expect(response.body.data).toEqual({
      rows: [{ advance: true, employees: 12 }],
      reachedLimit: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("sensitive");
  });

  it("recusa grant de obrigações associado a outra fonte, corpo ou requisição", async () => {
    const body = { source: "pessoal.obligations", fields: ["competence"], limit: 1 };
    const { app, extract } = createApp();
    const invalidGrants = [
      signedGrant(body, undefined, { source: "pessoal.ldd" }),
      signedGrant(body, undefined, { request_id: "other-request" }),
      signedGrant({ ...body, fields: ["payroll"] }),
    ];

    for (const signed of invalidGrants) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, internalToken)
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(body)
        .expect(403);
    }

    expect(extract).not.toHaveBeenCalled();
  });
});
