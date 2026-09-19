import "./envBootstrap.js";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createLoggerMock, regularizeTestEnv } from "./regularizeTestUtils.js";

describe("regularize internal routes", () => {
  it("POST /internal/reconciliation/run requires the internal token", async () => {
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 1 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app).post("/internal/reconciliation/run").send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("POST /internal/reconciliation/run rejects a wrong internal token", async () => {
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 1 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "wrong-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("POST /internal/reconciliation/run delegates to the injected use case", async () => {
    const runReconciliation = vi.fn(async () => ({ processed: 1 }));
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation,
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.internalServiceToken)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { processed: 1 } });
    expect(runReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/license-notifications/run delegates to the injected use case", async () => {
    const runLicenseNotificationReconciliation = vi.fn(async () => ({ created: 2 }));
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation,
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/license-notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.internalServiceToken)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { created: 2 } });
    expect(runLicenseNotificationReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/client-pf-status/run delegates to the injected use case", async () => {
    const runClientPfStatusReconciliation = vi.fn(async () => ({ updated: 3 }));
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation,
      runClientPfDocumentsReconciliation: vi.fn(async () => ({ created: 0 })),
    });

    const response = await request(app)
      .post("/internal/reconciliation/client-pf-status/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.internalServiceToken)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { updated: 3 } });
    expect(runClientPfStatusReconciliation).toHaveBeenCalledTimes(1);
  });

  it("POST /internal/reconciliation/client-pf-documents/run delegates to the injected use case", async () => {
    const runClientPfDocumentsReconciliation = vi.fn(async () => ({ created: 4 }));
    const app = createApp({
      env: regularizeTestEnv,
      logger: createLoggerMock(),
      prisma: {} as PrismaClient,
      reconciliationService: {} as never,
      runReconciliation: vi.fn(async () => ({ processed: 0 })),
      runLicenseNotificationReconciliation: vi.fn(async () => ({ created: 0 })),
      runClientPfStatusReconciliation: vi.fn(async () => ({ updated: 0 })),
      runClientPfDocumentsReconciliation,
    });

    const response = await request(app)
      .post("/internal/reconciliation/client-pf-documents/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, regularizeTestEnv.internalServiceToken)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { created: 4 } });
    expect(runClientPfDocumentsReconciliation).toHaveBeenCalledTimes(1);
  });
});
