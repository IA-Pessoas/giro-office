import { createHash, createHmac, randomUUID } from "node:crypto";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const grantSecret = "test-reports-grant-secret";
const internalToken = "test-reports-internal-token";
const organizationId = "10000000-0000-4000-8000-000000000001";

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
  const requestId = `request-${randomUUID()}`;
  const payload = {
    audience: "ti-service",
    body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    expires_at: input.expiresAt ?? issuedAt + 60,
    fields: input.fields,
    issued_at: issuedAt,
    operation: input.operation,
    organization_id: organizationId,
    request_id: requestId,
    source: input.source,
    version: 1,
  };
  const grant = Buffer.from(canonicalJson(payload)).toString("base64url");
  return {
    grant,
    requestId,
    signature: createHmac("sha256", grantSecret).update(grant).digest("hex"),
  };
}

function reportingHeaders(signed: ReturnType<typeof createGrant>) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: internalToken,
    "x-request-id": signed.requestId,
    "x-reports-grant": signed.grant,
    "x-reports-grant-signature": signed.signature,
  };
}

describe("ti internal reporting routes", () => {
  it("publica o catálogo combinado sem expor chaves internas", async () => {
    const signed = createGrant({
      operation: "catalog",
      source: "ti.catalog",
      fields: [],
      body: {},
    });

    const response = await request(createTestApp())
      .get("/internal/reporting/catalog")
      .set(reportingHeaders(signed))
      .expect(200);

    expect(response.body.data.sources.map((source: { key: string }) => source.key)).toEqual([
      "ti.inventory",
      "ti.stock",
    ]);
    expect(response.body.data.sources.every((source: { keys?: unknown }) => !source.keys)).toBe(
      true,
    );
  });

  it("roteia as extrações de inventário e estoque", async () => {
    const prisma = createPrismaMock();
    prisma.stock.findMany = vi.fn(async () => []);
    const app = createTestApp(prisma as never);
    const requests = [
      { source: "ti.inventory", fields: ["asset_code"] },
      { source: "ti.stock", fields: ["name"] },
    ] as const;

    for (const { source, fields } of requests) {
      const body = { source, fields: [...fields], limit: 1 };
      const signed = createGrant({ operation: "extract", source, fields: [...fields], body });
      await request(app)
        .post("/internal/reporting/extract")
        .set(reportingHeaders(signed))
        .send(body)
        .expect(200);
    }

    expect(prisma.inventoryTecnologia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId }, take: 2 }),
    );
    expect(prisma.stock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: organizationId }, take: 2 }),
    );
  });

  it("rejeita grant expirado e campos não publicados antes de consultar o banco", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as never);
    const expiredBody = { source: "ti.inventory", fields: ["asset_code"], limit: 1 };
    const expired = createGrant({
      operation: "extract",
      source: expiredBody.source,
      fields: expiredBody.fields,
      body: expiredBody,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    const invalidBody = { source: "ti.stock", fields: ["id"], limit: 1 };
    const invalid = createGrant({
      operation: "extract",
      source: invalidBody.source,
      fields: invalidBody.fields,
      body: invalidBody,
    });

    await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(expired))
      .send(expiredBody)
      .expect(403);
    await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(invalid))
      .send(invalidBody)
      .expect(403);

    expect(prisma.inventoryTecnologia.findMany).not.toHaveBeenCalled();
    expect(prisma.stock.findMany).not.toHaveBeenCalled();
  });

  it("rejeita o replay do mesmo grant para ambos os sources", async () => {
    const prisma = createPrismaMock();
    prisma.stock.findMany = vi.fn(async () => []);
    const app = createTestApp(prisma as never);
    const body = { source: "ti.stock", fields: ["name"], limit: 1 };
    const signed = createGrant({
      operation: "extract",
      source: body.source,
      fields: body.fields,
      body,
    });

    await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(signed))
      .send(body)
      .expect(200);
    await request(app)
      .post("/internal/reporting/extract")
      .set(reportingHeaders(signed))
      .send(body)
      .expect(403);
  });

  it("rejeita token interno ausente", async () => {
    const signed = createGrant({
      operation: "catalog",
      source: "ti.catalog",
      fields: [],
      body: {},
    });

    await request(createTestApp())
      .get("/internal/reporting/catalog")
      .set({
        "x-request-id": signed.requestId,
        "x-reports-grant": signed.grant,
        "x-reports-grant-signature": signed.signature,
      })
      .expect(403);
  });
});
