import "./envBootstrap.js";

import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTiApplication } from "../app.js";
import type { TiServiceEnv } from "../config/env.js";
import { requestContext } from "../middlewares/requestContext.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const tiTestEnv = {
  nodeEnv: "test",
  port: 3040,
  databaseUrl: "postgresql://localhost/ti_service_test",
  auditServiceUrl: "http://localhost:3020",
  auditServiceToken: "audit-service-token-test",
  internalServiceToken: "ti-service-internal-token-test",
  passwordEncryptionKey: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
  allowedOrigins: ["*"],
  enableApiDocs: false,
  logLevel: "info",
  logPretty: false,
} satisfies TiServiceEnv;

const tiPublicOpenApiOperations = {
  "/ti/request-categories/list": ["get"],
  "/ti/request-categories": ["post"],
  "/ti/request-categories/{id}": ["patch"],
  "/ti/requests/list": ["get"],
  "/ti/requests": ["post"],
  "/ti/requests/{id}": ["get", "patch"],
  "/ti/requests/{id}/assign": ["patch"],
  "/ti/requests/{id}/status": ["patch"],
  "/ti/requests/{id}/messages": ["get", "post"],
  "/ti/inventory/list": ["get"],
  "/ti/inventory": ["post"],
  "/ti/inventory/{id}": ["get", "patch"],
  "/ti/inventory/{id}/assign-user": ["patch"],
  "/ti/inventory/{id}/return": ["patch"],
  "/ti/inventory-categories/list": ["get"],
  "/ti/inventory-categories": ["post"],
  "/ti/inventory-categories/{id}": ["patch"],
  "/ti/inventory-locations/list": ["get"],
  "/ti/inventory-locations": ["post"],
  "/ti/inventory-locations/{id}": ["patch"],
  "/ti/passwords/list": ["get"],
  "/ti/passwords": ["post"],
  "/ti/passwords/{id}": ["get", "patch"],
  "/ti/extensions/list": ["get"],
  "/ti/extensions": ["post"],
  "/ti/extensions/{id}": ["get", "patch"],
  "/ti/terms/list": ["get"],
  "/ti/terms": ["post"],
  "/ti/terms/{id}": ["get", "patch"],
  "/ti/terms/{id}/sign": ["patch"],
  "/ti/stock/items/{id}/movements/list": ["get"],
} as const;

const tiPublicOpenApiPaths = Object.keys(tiPublicOpenApiOperations);

const openApiHttpMethods = ["get", "post", "patch", "put", "delete"] as const;

function createPermissionTestApp() {
  const app = express();
  const logger = createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  app.use(requestContext);
  app.get("/admin", requireTiPermission(TiPermissionLevel.Admin), (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use(
    createExpressErrorHandler({
      logger,
      event: "ti-service.test-error",
      fallbackMessage: "Erro interno no ti-service.",
    }),
  );

  return app;
}

function createLoggerMock() {
  return createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

describe("ti-service app", () => {
  it("retorna envelope de sucesso no health check", async () => {
    const app = createTestApp();

    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ok",
        service: "ti-service",
        env: "test",
      },
    });
  });

  it("retorna envelope de sucesso no readiness check", async () => {
    const app = createTestApp();

    const response = await request(app).get("/ready").expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ready",
        service: "ti-service",
      },
    });
  });

  it("preserva x-request-id recebido no health check", async () => {
    const app = createTestApp();

    const response = await request(app).get("/health").set("x-request-id", "req-ti-1").expect(200);

    expect(response.headers["x-request-id"]).toBe("req-ti-1");
  });

  it("rejeita contexto encaminhado sem token interno", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/ti/dashboard")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "10000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "1")
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
  });

  it("aceita contexto encaminhado com token interno valido", async () => {
    const app = createTestApp();

    const response = await request(app)
      .get("/ti/dashboard")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "ti-service-internal-token-test")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "00000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "10000000-0000-4000-8000-000000000001")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "2")
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it("serve a especificacao OpenAPI publica quando habilitada", async () => {
    const app = createTiApplication({
      logger: createLoggerMock(),
      env: { ...tiTestEnv, enableApiDocs: true },
      prisma: createPrismaMock(),
    });

    const response = await request(app).get("/openapi.json").expect(200);

    expect(response.body.paths).toHaveProperty("/ti/requests/list");
    for (const path of tiPublicOpenApiPaths) {
      expect(response.body.paths).toHaveProperty(path);
    }

    const operationIds = new Set<string>();
    for (const [path, expectedMethods] of Object.entries(tiPublicOpenApiOperations)) {
      const pathItem = response.body.paths[path];
      const documentedMethods = openApiHttpMethods.filter(
        (method) => pathItem[method] !== undefined,
      );

      expect(documentedMethods).toEqual(expectedMethods);
      for (const method of expectedMethods) {
        const operation = pathItem[method];
        const operationId = operation.operationId;

        expect(operationId).toEqual(expect.any(String));
        expect(operationIds.has(operationId)).toBe(false);
        operationIds.add(operationId);
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(operation.responses["200"] ?? operation.responses["201"]).toBeDefined();
        expect(operation.responses).toHaveProperty("401");
      }
    }

    expect(
      response.body.paths["/ti/stock/items/{id}/movements/list"].get.responses["200"].content[
        "application/json"
      ].schema,
    ).toMatchObject({
      type: "object",
      required: ["success", "data"],
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "array",
          items: { $ref: "#/components/schemas/TiStockMovement" },
        },
      },
    });
  });
});

describe("ti-service permission middleware", () => {
  it("aceita permissao 2 como nivel administrativo do TI", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/admin")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "2")
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it("rejeita permissao 1 em rota administrativa do TI", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/admin")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "1")
      .expect(403);

    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });

  it("rejeita permissao encaminhada com valor malformado", async () => {
    const app = createPermissionTestApp();

    const response = await request(app)
      .get("/admin")
      .set(FORWARDED_AUTH_USER_ID_HEADER, "user-1")
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, "org-1")
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "3abc")
      .expect(403);

    expect(response.body).toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
  });
});
