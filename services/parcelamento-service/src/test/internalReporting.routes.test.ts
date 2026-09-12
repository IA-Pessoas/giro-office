import "./envBootstrap.js";

import { createHash, createHmac } from "node:crypto";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createParcelamentoApp } from "../app.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-811";

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

function grant(
  operation: "catalog" | "extract",
  source: string,
  fields: string[],
  body: unknown,
  encoding: "canonical" | "reordered" | "spaced" = "canonical",
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "parcelamento-service",
    body_sha256: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    expires_at: issuedAt + 60,
    fields,
    issued_at: issuedAt,
    operation,
    organization_id: "00000000-0000-4000-8000-000000000002",
    request_id: requestId,
    source,
    version: 1,
  };
  const encoded = Buffer.from(
    encoding === "canonical"
      ? canonicalJson(payload)
      : JSON.stringify(
          encoding === "reordered" ? { version: payload.version, ...payload } : payload,
          null,
          2,
        ),
  ).toString("base64url");
  return {
    encoded,
    signature: createHmac("sha256", grantSecret).update(encoded).digest("hex"),
  };
}

function createApp() {
  return createParcelamentoApp({
    env: {
      port: 3043,
      nodeEnv: "test",
      databaseUrl: "postgresql://user:pass@localhost:5432/db",
      jwtSecret: "test-jwt-secret",
      auditEnabled: true,
      auditServiceUrl: "http://localhost:3020",
      auditServiceToken: "test-audit-token",
      reportsInternalToken: "test-reports-internal-token",
      reportsGrantSecret: grantSecret,
      logLevel: "silent",
      logPretty: false,
      allowedOrigins: ["*"],
      enableApiDocs: false,
    },
    logger: { error: vi.fn() } as never,
    prisma: {
      $queryRaw: vi.fn(),
      installment: { findMany: vi.fn().mockResolvedValue([{ status: "active" }]) },
    } as never,
    auditService: { recordChange: vi.fn() },
  });
}

describe("internal reporting routes", () => {
  it("exige token interno e grant HMAC valido para catalogo", async () => {
    const signed = grant("catalog", "parcelamento.catalog", [], {});
    const missing = await request(createApp()).get("/internal/reporting/catalog").expect(403);
    const valid = await request(createApp())
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.encoded)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(missing.body.success).toBe(false);
    expect(valid.body.data.sources).toHaveLength(3);
  });

  it("recusa grant assinado com JSON não canônico", async () => {
    for (const encoding of ["reordered", "spaced"] as const) {
      const signed = grant("catalog", "parcelamento.catalog", [], {}, encoding);

      await request(createApp())
        .get("/internal/reporting/catalog")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.encoded)
        .set("x-reports-grant-signature", signed.signature)
        .expect(403);
    }
  });

  it("retorna rows e reachedLimit no extract autenticado", async () => {
    const body = { source: "parcelamento.installments", fields: ["status"], limit: 10 };
    const signed = grant("extract", body.source, body.fields, body);
    const app = createApp();

    const missing = await request(app)
      .post("/internal/reporting/extract")
      .send(body)
      .expect(403);
    const valid = await request(app)
      .post("/internal/reporting/extract")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.encoded)
      .set("x-reports-grant-signature", signed.signature)
      .send(body)
      .expect(200);

    expect(missing.body.success).toBe(false);
    expect(valid.body.data.rows).toEqual([{ status: "active" }]);
    expect(valid.body.data.reachedLimit).toBe(false);
  });
});
