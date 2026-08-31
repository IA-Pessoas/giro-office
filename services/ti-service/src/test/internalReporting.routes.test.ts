import { createHash, createHmac } from "node:crypto";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTestApp } from "./tiServiceTestUtils.js";

const grantSecret = "test-reports-grant-secret";
const requestId = "request-853";

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

function createGrant(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: string[];
  body: unknown;
  expiresAt?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    audience: "ti-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: "10000000-0000-4000-8000-000000000001",
    request_id: requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    signature: createHmac("sha256", grantSecret).update(grant).digest("hex"),
  };
}

describe("ti internal reporting routes", () => {
  it("exige token interno e grant válido para o catálogo", async () => {
    const signed = createGrant({
      operation: "catalog",
      source: "ti.catalog",
      fields: [],
      body: {},
    });

    await request(createTestApp()).get("/internal/reporting/catalog").expect(403);

    const response = await request(createTestApp())
      .get("/internal/reporting/catalog")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
      .set("x-request-id", requestId)
      .set("x-reports-grant", signed.grant)
      .set("x-reports-grant-signature", signed.signature)
      .expect(200);

    expect(response.body.data.sources[0].keys.map((field: { key: string }) => field.key)).toEqual([
      "user_id",
      "location_id",
      "category_id",
      "responsible_it_staff_id",
    ]);
  });

  it("rejeita grant expirado e fonte não publicada sem consultar o inventário", async () => {
    const prisma = {
      ...(await import("./tiServiceTestUtils.js")).createPrismaMock(),
      inventoryTecnologia: { findMany: vi.fn() },
    };
    const expiredBody = { source: "ti.inventory", fields: ["asset_code"], limit: 1 };
    const expired = createGrant({
      operation: "extract",
      source: expiredBody.source,
      fields: expiredBody.fields,
      body: expiredBody,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    const invalidBody = { source: "ti.inventory", fields: ["id"], limit: 1 };
    const invalid = createGrant({
      operation: "extract",
      source: invalidBody.source,
      fields: invalidBody.fields,
      body: invalidBody,
    });

    const app = createTestApp(prisma as never);
    for (const [body, signed] of [
      [expiredBody, expired],
      [invalidBody, invalid],
    ] as const) {
      await request(app)
        .post("/internal/reporting/extract")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "test-reports-internal-token")
        .set("x-request-id", requestId)
        .set("x-reports-grant", signed.grant)
        .set("x-reports-grant-signature", signed.signature)
        .send(body)
        .expect(403);
    }

    expect(prisma.inventoryTecnologia.findMany).not.toHaveBeenCalled();
  });
});
