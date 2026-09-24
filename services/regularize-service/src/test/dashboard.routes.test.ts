import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { buildRegularizeServiceOpenApiSpec } from "../openapi/spec.js";
import { createTestApp, gatewayHeaders, regularizeTestEnv } from "./regularizeTestUtils.js";

function createDashboardPrisma(): PrismaClient {
  return {
    process: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    license: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([]),
    },
    clientPF: { count: vi.fn().mockResolvedValue(3) },
    sitePasswordsRegularize: { count: vi.fn().mockResolvedValue(4) },
    client: {
      count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient;
}

describe("regularize dashboard route", () => {
  it("requires authentication", async () => {
    const response = await request(createTestApp()).get("/regularize/dashboard?year=2026");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("validates the required integer year", async () => {
    const response = await request(createTestApp())
      .get("/regularize/dashboard?year=invalid")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BAD_REQUEST");
  });

  it("returns the aggregate success envelope", async () => {
    const response = await request(createTestApp(createDashboardPrisma()))
      .get("/regularize/dashboard?year=2026")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        year: 2026,
        metrics: {
          openProcesses: 1,
          activeLicenses: 2,
          activeClientPfs: 3,
          activeSites: 4,
          municipalTaxesCompleted: 2,
          municipalTaxesPending: 3,
          municipalTaxesTotal: 5,
        },
      },
    });
  });

  it("keeps legacy guidance placeholder processes out of the dashboard", async () => {
    const prisma = createDashboardPrisma();
    await request(createTestApp(prisma))
      .get("/regularize/dashboard?year=2026")
      .set(gatewayHeaders());

    const excluded = { process_type: { not: "Processo técnico para orientação legada" } };
    expect(vi.mocked(prisma.process.count).mock.calls[0]?.[0]?.where).toMatchObject(excluded);
    expect(vi.mocked(prisma.process.findMany).mock.calls[0]?.[0]?.where).toMatchObject(excluded);
  });

  it("returns a safe requestId when aggregation fails", async () => {
    const prisma = createDashboardPrisma();
    vi.mocked(prisma.process.count).mockRejectedValueOnce(new Error("private database detail"));

    const response = await request(createTestApp(prisma))
      .get("/regularize/dashboard?year=2026")
      .set({ ...gatewayHeaders(), "x-request-id": "request-dashboard-1" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: "Erro interno no regularize-service.",
      code: "INTERNAL_ERROR",
      requestId: "request-dashboard-1",
    });
    expect(JSON.stringify(response.body)).not.toContain("private database detail");
  });

  it("publishes the dashboard endpoint in OpenAPI", () => {
    const spec = buildRegularizeServiceOpenApiSpec(regularizeTestEnv);

    expect(spec.paths["/regularize/dashboard"]).toBeDefined();
  });
});
