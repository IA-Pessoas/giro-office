import { createHash, createHmac } from "node:crypto";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createInternalReportingRouter } from "../routes/internalReporting.routes.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-812";
const organizationId = "00000000-0000-4000-8000-000000000002";

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

function signedGrant(body: unknown, encoding: "canonical" | "spaced" = "canonical") {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "client-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields: body === null ? [] : (body as { fields: string[] }).fields,
    issued_at: issuedAt,
    operation: body === null ? "catalog" : "extract",
    organization_id: organizationId,
    request_id: requestId,
    source: body === null ? "integracao.catalog" : (body as { source: string }).source,
    version: 1,
  };
  const grant = Buffer.from(
    encoding === "canonical" ? canonicalJson(payload) : JSON.stringify(payload, null, 2),
  ).toString("base64url");
  return { grant, signature: createHmac("sha256", grantSecret).update(grant).digest("hex") };
}

function createApp(
  extract = vi.fn().mockResolvedValue({
    rows: [{ name: "Cliente seguro" }],
    reachedLimit: true,
  }),
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
      event: "client-service.test",
      fallbackMessage: "Erro interno no client-service.",
    }),
  );
  return { app, extract };
}

describe("internal reporting routes", () => {
  it("exige token e grant HMAC, depois usa organização somente do grant", async () => {
    const body = { source: "integracao.clients", fields: ["name"], limit: 10 };
    const signed = signedGrant(body);
    const { app, extract } = createApp();

    await request(app).post("/internal/reporting/extract").send(body).expect(403);
    const valid = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(valid.body.data.rows).toEqual([{ name: "Cliente seguro" }]);
    expect(valid.body.data.reachedLimit).toBe(true);

    expect(extract).toHaveBeenCalledWith({
      organizationId,
      source: "integracao.clients",
      fields: ["name"],
      limit: 10,
    });
  });

  it("recusa grant HMAC assinado com JSON não canônico", async () => {
    const signed = signedGrant(null, "spaced");
    const { app } = createApp();

    await request(app)
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(403);
  });
});
