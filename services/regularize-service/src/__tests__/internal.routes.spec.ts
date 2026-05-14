import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { RegularizeServiceEnv } from "../config/env.js";

const internalServiceToken = "internal-token";

const env: RegularizeServiceEnv = {
  port: 3411,
  nodeEnv: "test",
  databaseUrl: "postgresql://localhost/test",
  jwtSecret: "secret",
  auditServiceToken: "audit-service-token",
  internalServiceToken,
  encryptionKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
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
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
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
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalServiceToken);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/license-notifications/run executes the specific reconciliation", async () => {
    const runLicenseNotificationReconciliation = vi.fn(async () => ({ created: 2 }));
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma: {} as never,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation,
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/license-notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalServiceToken);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runLicenseNotificationReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/client-pf-status/run executes the specific reconciliation", async () => {
    const runClientPfStatusReconciliation = vi.fn(async () => ({ updated: 1 }));
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma: {} as never,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation,
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/client-pf-status/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalServiceToken);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runClientPfStatusReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/client-pf-documents/run executes the specific reconciliation", async () => {
    const runClientPfDocumentsReconciliation = vi.fn(async () => ({ created: 4 }));
    const app = createApp({
      env,
      logger: createLoggerMock(),
      prisma: {} as never,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation,
    });

    const response = await request(app)
      .post("/internal/reconciliation/client-pf-documents/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, internalServiceToken);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(runClientPfDocumentsReconciliation).toHaveBeenCalledTimes(1);
  });
});
