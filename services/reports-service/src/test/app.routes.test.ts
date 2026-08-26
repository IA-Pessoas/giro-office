import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportsApp } from "../app.js";

describe("reports-service app", () => {
  it("expoe infraestrutura e bloqueia o catalogo sem contexto autenticado", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    };
    const app = createReportsApp({
      env: {
        port: 3044,
        nodeEnv: "test",
        databaseUrl: "postgresql://user:pass@localhost:5432/db",
        jwtSecret: "test-jwt-secret",
        reportsInternalToken: "test-reports-internal-token",
        reportsGrantSecret: "test-reports-grant-secret",
        userServiceUrl: "http://localhost:3001",
        parcelamentoServiceUrl: "http://localhost:3043",
        clientServiceUrl: "http://localhost:3000",
        taskServiceUrl: "http://localhost:3032",
        projectServiceUrl: "http://localhost:3033",
        workerPollIntervalMs: 5000,
        workerConcurrency: 2,
        workerLeaseSeconds: 120,
        adapterTimeoutMs: 10000,
        sourceTimeoutMs: 10000,
        previewRowLimit: 100,
        logLevel: "silent",
        logPretty: false,
        allowedOrigins: ["*"],
        enableApiDocs: true,
      },
      logger: { error: vi.fn() } as never,
      prisma: prisma as never,
    });

    const health = await request(app).get("/health").expect(200);
    const ready = await request(app).get("/ready").expect(200);
    const openapi = await request(app).get("/openapi.json").expect(200);
    const catalog = await request(app).get("/reports/catalog").expect(401);

    expect(health.body).toEqual({
      success: true,
      data: { status: "ok", service: "reports-service", env: "test" },
    });
    expect(ready.body).toEqual({
      success: true,
      data: { status: "ready", service: "reports-service" },
    });
    expect(openapi.body.paths["/reports/catalog"]).toBeDefined();
    expect(openapi.body.paths["/reports/models"]).toBeDefined();
    expect(openapi.body.paths["/reports/models/shared"]).toBeDefined();
    expect(openapi.body.paths["/reports/models/shared/list"]).toBeDefined();
    expect(openapi.body.paths["/reports/models/shared/{id}"]).toBeDefined();
    expect(openapi.body.paths["/reports/models/shared/{id}/copy"]).toBeDefined();
    expect(openapi.body.paths["/reports/models/shared/{id}/preview"]).toBeDefined();
    expect(openapi.body.paths["/reports/jobs"]).toBeDefined();
    expect(openapi.body.paths["/reports/jobs/{id}/snapshot"]).toBeDefined();
    expect(openapi.body.paths["/reports/jobs/{id}"].delete).toBeDefined();
    expect(openapi.body.paths["/reports/history"]).toBeDefined();
    expect(openapi.body.paths["/reports/retention"]).toBeDefined();
    expect(catalog.body.success).toBe(false);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("retorna o catalogo com o contexto autenticado encaminhado", async () => {
    const app = createReportsApp({
      env: {
        port: 3044,
        nodeEnv: "test",
        databaseUrl: "postgresql://user:pass@localhost:5432/db",
        jwtSecret: "test-jwt-secret",
        reportsInternalToken: "test-reports-internal-token",
        reportsGrantSecret: "test-reports-grant-secret",
        userServiceUrl: "http://localhost:3001",
        parcelamentoServiceUrl: "http://localhost:3043",
        clientServiceUrl: "http://localhost:3000",
        taskServiceUrl: "http://localhost:3032",
        projectServiceUrl: "http://localhost:3033",
        workerPollIntervalMs: 5000,
        workerConcurrency: 2,
        workerLeaseSeconds: 120,
        adapterTimeoutMs: 10000,
        sourceTimeoutMs: 10000,
        previewRowLimit: 100,
        logLevel: "silent",
        logPretty: false,
        allowedOrigins: ["*"],
        enableApiDocs: false,
      },
      logger: { error: vi.fn() } as never,
      prisma: { $queryRaw: vi.fn() } as never,
      reporting: {
        accessContextClient: {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: "00000000-0000-4000-8000-000000000002" },
            modules: {},
          }),
        },
      },
    });

    const catalog = await request(app)
      .get("/reports/catalog")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "00000000-0000-4000-8000-000000000002")
      .expect(200);

    expect(catalog.body).toEqual({ success: true, data: { items: [] } });
  });
});
