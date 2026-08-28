import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import {
  createExpressErrorHandler,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
} from "@workspace/shared";
import "express-async-errors";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const env = {
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
  return {
    grant,
    signature: createHmac("sha256", env.reportsGrantSecret).update(grant).digest("hex"),
  };
}

function createTestApp(reportingService = { extract: vi.fn() }) {
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
  it("publica o catálogo sem IDs, segredos ou relações", async () => {
    const body = {};
    const requestId = "request-837-catalog";
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

    expect(response.body.data.sources[0]).toEqual(
      expect.objectContaining({
        key: "certificado.pj",
        module: "certificado",
        keys: [],
      }),
    );
    expect(response.body.data.sources[0].fields.map((field: { key: string }) => field.key)).toEqual(
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
    expect(JSON.stringify(response.body)).not.toMatch(/organization_id|password|file_path|sql/i);
  });

  it("rejeita token inválido, grant expirado e limite inválido", async () => {
    const body = { source: "certificado.pj", fields: ["name"], limit: 2 };
    const requestId = "request-837-invalid";
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
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.reportsInternalToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(403);

    await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.reportsInternalToken)
      .send({ ...body, limit: 102 })
      .expect(400);
  });

  it("encaminha organização do grant e devolve reachedLimit", async () => {
    const body = { source: "certificado.pj", fields: ["name"], limit: 2 };
    const requestId = "request-837-extract";
    const signed = grantFor({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
      requestId,
    });
    const reportingService = {
      extract: vi.fn().mockResolvedValue({
        rows: [{ name: "Empresa segura" }],
        reachedLimit: true,
      }),
    };
    const { app } = createTestApp(reportingService);

    const response = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.reportsInternalToken)
      .set(REQUEST_ID_HEADER, requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { rows: [{ name: "Empresa segura" }], reachedLimit: true },
    });
    expect(reportingService.extract).toHaveBeenCalledWith({
      organizationId,
      source: "certificado.pj",
      fields: ["name"],
      limit: 2,
    });
  });
});
