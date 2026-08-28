import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import {
  createExpressErrorHandler,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const env = {
  certificateReportingToken: "certificate-reporting-token",
  certificateReportingGrantSecret: "certificate-reporting-secret",
  reportsInternalToken: "reports-internal-token",
  reportsGrantSecret: "reports-grant-secret",
};

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

function credentialsFor(source: string) {
  return source === "certificado.pf"
    ? {
        token: env.certificateReportingToken,
        secret: env.certificateReportingGrantSecret,
      }
    : { token: env.reportsInternalToken, secret: env.reportsGrantSecret };
}

function grantFor(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
  requestId: string;
  organizationId?: string;
  expiresAt?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "certificate-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: input.organizationId ?? organizationId,
    request_id: input.requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  const { secret } = credentialsFor(input.source);
  return {
    grant,
    signature: createHmac("sha256", secret).update(grant).digest("hex"),
  };
}

function createTestApp(
  reportingService = { consumeGrant: vi.fn().mockResolvedValue(undefined), extract: vi.fn() },
) {
  const app = express();
  app.use(express.json());
  app.use("/internal", createInternalReportingRouter({ env, reportingService } as never));
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "certificate-service.internal-reporting.test",
      fallbackMessage: "Erro interno no certificate-service.",
    }),
  );
  return { app, reportingService };
}

describe("certificate-service internal reporting routes", () => {
  it("publica os catálogos PF e PJ sem dados sensíveis ou relações", async () => {
    const body = {};
    const requestId = "request-838-catalog";
    const signed = grantFor({
      operation: "catalog",
      source: "certificado.catalog",
      fields: [],
      body,
      requestId,
    });
    const { app } = createTestApp();

    const response = await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.reportsInternalToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(response.body.data.sources.map((source: { key: string }) => source.key)).toEqual([
      "certificado.pf",
      "certificado.pj",
    ]);
    expect(response.body.data.sources[0]).toEqual(
      expect.objectContaining({ key: "certificado.pf", module: "certificado", keys: [] }),
    );
    expect(response.body.data.sources[0].fields.map((field: { key: string }) => field.key)).toEqual(
      [
        "name",
        "model",
        "enterprise",
        "expiration_date",
        "has_certificate",
        "was_paid",
        "payment_date",
        "payment_amount",
      ],
    );
    expect(response.body.data.sources[1].fields.map((field: { key: string }) => field.key)).toEqual(
      [
        "name",
        "model",
        "legal_nature",
        "expiration_date",
        "has_certificate",
        "was_paid",
        "payment_date",
        "payment_amount",
      ],
    );
    expect(response.body.data.relations).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /organization_id|password|cpf|file_path|sql/i,
    );
  });

  it("rejeita token inválido, grant expirado e limite inválido", async () => {
    const body = { source: "certificado.pf", fields: ["name"], limit: 2 };
    const requestId = "request-838-invalid";
    const signed = grantFor({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      requestId,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    const { app } = createTestApp();

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "wrong-token")
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.certificateReportingToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.certificateReportingToken)
      .send({ ...body, limit: 102 })
      .expect(400);
  });

  it("encaminha organização do grant e rejeita replay para PF", async () => {
    const body = { source: "certificado.pf", fields: ["name"], limit: 2 };
    const requestId = "request-838-extract";
    const signed = grantFor({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      requestId,
    });
    const reportingService = {
      consumeGrant: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new ServiceError(403, "Grant de relatórios já utilizado.")),
      extract: vi.fn().mockResolvedValue({
        rows: [{ name: "Pessoa segura" }],
        reachedLimit: true,
      }),
    };
    const { app } = createTestApp(reportingService);

    const response = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.certificateReportingToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { rows: [{ name: "Pessoa segura" }], reachedLimit: true },
    });
    expect(reportingService.extract).toHaveBeenCalledWith({
      organizationId,
      source: "certificado.pf",
      fields: ["name"],
      limit: 2,
    });

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.certificateReportingToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    expect(reportingService.extract).toHaveBeenCalledTimes(1);
  });

  it("encaminha extração PJ com as credenciais compartilhadas de relatórios", async () => {
    const body = { source: "certificado.pj", fields: ["name"], limit: 1 };
    const requestId = "request-838-pj-extract";
    const signed = grantFor({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      requestId,
    });
    const reportingService = {
      consumeGrant: vi.fn().mockResolvedValue(undefined),
      extract: vi.fn().mockResolvedValue({
        rows: [{ name: "Empresa segura" }],
        reachedLimit: false,
      }),
    };
    const { app } = createTestApp(reportingService);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.reportsInternalToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(reportingService.extract).toHaveBeenCalledWith({
      organizationId,
      source: "certificado.pj",
      fields: ["name"],
      limit: 1,
    });
  });
});
