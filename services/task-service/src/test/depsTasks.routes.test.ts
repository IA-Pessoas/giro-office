import { createExpressErrorHandler } from "@workspace/shared";
import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createDepsTasksRoutes } from "../routes/depsTasks.routes.js";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/task-service-test";
process.env.JWT_SECRET ??= "task-service-secret";
process.env.AUDIT_SERVICE_TOKEN ??= "audit-service-token";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function createTestLogger() {
  return createLogger({
    service: "task-service-test",
    env: "test",
    destination: new MemoryLogStream(),
  });
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 2 }),
  };
}

function createTestApp() {
  const app = express();
  const logger = createTestLogger();

  app.use(express.json());
  app.use(
    "/task",
    createDepsTasksRoutes({
      async listDepartmentsWithTaskModels() {
        return [];
      },
      async listTaskModelOptions() {
        return { users: [], departments: [] };
      },
    }),
  );
  app.use(
    createExpressErrorHandler({
      logger,
      event: "task-service-test.error",
      fallbackMessage: "Erro interno no task-service.",
    }),
  );

  return app;
}

describe("depsTasks routes", () => {
  it("GET /task/deps/list sem autenticacao retorna 401", async () => {
    const app = createTestApp();
    const response = await request(app).get("/task/deps/list");

    expect(response.status).toBe(401);
  });

  it("GET /task/deps/list com auth do gateway retorna 200", async () => {
    const app = createTestApp();
    const response = await request(app).get("/task/deps/list").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
  });

  it("GET /task/deps/options retorna opções para o formulário de modelos", async () => {
    const app = createTestApp();
    const response = await request(app).get("/task/deps/options").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { users: [], departments: [] },
    });
  });

  it("GET /task/deps/options sem autenticacao retorna 401", async () => {
    const app = createTestApp();
    const response = await request(app).get("/task/deps/options");

    expect(response.status).toBe(401);
  });

  it("GET /task/deps/options exige ao menos nível 1 da Integração", async () => {
    const app = createTestApp();
    const response = await request(app)
      .get("/task/deps/options")
      .set({
        ...gatewayHeaders(),
        [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ integracao: 0 }),
      });

    expect(response.status).toBe(403);
  });
});
