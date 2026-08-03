import "./envBootstrap.js";

import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createParcelamentoApp } from "../app.js";
import type { ParcelamentoServiceEnv } from "../config/env.js";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";

function createTestLogger() {
  return createLogger({
    service: "parcelamento-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function createEnv(overrides: Partial<ParcelamentoServiceEnv> = {}): ParcelamentoServiceEnv {
  return {
    port: 3043,
    nodeEnv: "test",
    databaseUrl: "postgresql://user:pass@localhost:5432/db",
    jwtSecret: "test-jwt-secret",
    auditEnabled: true,
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "test-audit-token",
    logLevel: "silent",
    logPretty: false,
    allowedOrigins: ["*"],
    enableApiDocs: true,
    ...overrides,
  };
}

function createPrismaMock(): Pick<ParcelamentoPrismaClient, "$queryRaw"> {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
  };
}

function createAuditServiceMock() {
  return {
    recordChange: vi.fn().mockResolvedValue(undefined),
  };
}

describe("parcelamento-service app", () => {
  it("expoe health e readiness com envelope de sucesso", async () => {
    const prisma = createPrismaMock();
    const app = createParcelamentoApp({
      env: createEnv(),
      logger: createTestLogger(),
      prisma: prisma as ParcelamentoPrismaClient,
      auditService: createAuditServiceMock(),
    });

    const health = await request(app).get("/health").expect(200);
    const ready = await request(app).get("/ready").expect(200);

    expect(health.body).toEqual({
      success: true,
      data: { status: "ok", service: "parcelamento-service", env: "test" },
    });
    expect(ready.body).toEqual({
      success: true,
      data: { status: "ready", service: "parcelamento-service" },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("renderiza docs quando habilitado", async () => {
    const app = createParcelamentoApp({
      env: createEnv({ enableApiDocs: true }),
      logger: createTestLogger(),
      prisma: createPrismaMock() as ParcelamentoPrismaClient,
      auditService: createAuditServiceMock(),
    });

    const response = await request(app).get("/docs/").expect(200);

    expect(response.text).toContain("Parcelamento Service");
  });
});
