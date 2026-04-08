import { Writable } from "node:stream";

import { createExpressErrorHandler } from "@workspace/shared";
import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { createLogger } from "@workspace/shared/logger";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createDepsTasksRoutes } from "./deps-tasks.routes.js";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/task-service-test";
process.env.JWT_SECRET ??= "task-service-secret";
process.env.AUDIT_SERVICE_TOKEN ??= "audit-service-token";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

class MemoryLogStream extends Writable {
  override _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

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
  };
}

describe("deps-tasks routes", () => {
  it("GET /integracao-depsTasks sem token interno retorna 401", async () => {
    const app = express();
    const logger = createTestLogger();
    app.use(express.json());
    app.use(
      createDepsTasksRoutes({
        async listDepartmentsWithTaskModels() {
          return [];
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

    const response = await request(app).get("/integracao-depsTasks");
    expect(response.status).toBe(401);
  });

  it("GET /integracao-depsTasks com auth interno retorna 200", async () => {
    const app = express();
    const logger = createTestLogger();
    app.use(express.json());
    app.use(
      createDepsTasksRoutes({
        async listDepartmentsWithTaskModels() {
          return [];
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

    const response = await request(app).get("/integracao-depsTasks").set(gatewayHeaders());
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
  });
});

