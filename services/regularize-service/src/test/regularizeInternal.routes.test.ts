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
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "internal-token")
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { processed: 1 } });
    expect(runReconciliation).toHaveBeenCalledTimes(1);
  });
});
