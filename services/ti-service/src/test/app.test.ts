import "./envBootstrap.js";

import {
  createExpressErrorHandler,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { requestContext } from "../middlewares/requestContext.js";
import { requireTiPermission } from "../middlewares/requireTiPermission.js";
import { createTestApp } from "./tiServiceTestUtils.js";

function createPermissionTestApp() {
  const app = express();
  const logger = createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  app.use(requestContext);
  app.get("/admin", requireTiPermission(3), (_request, response) => {
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
});

describe("ti-service permission middleware", () => {
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
