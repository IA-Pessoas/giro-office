import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RegularizeServiceEnv } from "../config/env.js";

const env: RegularizeServiceEnv = {
  port: 3411,
  nodeEnv: "test",
  databaseUrl: "postgresql://localhost/test",
  jwtSecret: "secret",
  auditServiceToken: "audit-service-token",
  internalServiceToken: "internal-token",
  encryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  enableReconciliationSchedule: false,
  licenseNotificationCron: "30 4 * * *",
  clientPfStatusCron: "* 5 * * *",
  clientPfDocumentsCron: "30 5 * * *",
  reconciliationTimezone: "America/Sao_Paulo",
  logLevel: "info",
  logPretty: false,
  enableApiDocs: false,
};

process.env.DATABASE_URL = env.databaseUrl;
process.env.JWT_SECRET = env.jwtSecret;
process.env.AUDIT_SERVICE_TOKEN = env.auditServiceToken;
process.env.MTK_ENCRYPTION_KEY = env.encryptionKey;

function createLoggerMock() {
  const child = vi.fn();
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: child.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
    }),
  } as never;
}

describe("regularize internal routes", () => {
  it("POST /internal/reconciliation/run rejects invalid token", async () => {
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma: {} as never,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
    });

    const response = await request(app).post("/internal/reconciliation/run");

    expect(response.status).toBe(403);
  });

  it("POST /internal/reconciliation/run executes reconciliation with internal token", async () => {
    const runReconciliation = vi.fn(async () => ({ processed: 3 }));
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma: {} as never,
      reconciliationService: {} as never,
      runReconciliation,
    });

    const response = await request(app)
      .post("/internal/reconciliation/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, env.internalServiceToken!);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runReconciliation).toHaveBeenCalledTimes(1);
  });
});
