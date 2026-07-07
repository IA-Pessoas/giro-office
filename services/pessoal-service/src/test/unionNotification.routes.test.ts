import "./envBootstrap.js";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPessoalInternalNotificationRoutes } from "../routes/unionNotification.routes.js";
import { createRouteTestApp } from "./pessoalCoreTestUtils.js";

describe("union notification internal routes", () => {
  it("rejeita token interno ausente", async () => {
    const service = {
      runForDate: vi.fn(async () => ({
        organizations: 0,
        unionsMatched: 0,
        notificationsCreated: 0,
        duplicatesSkipped: 0,
      })),
    };
    const app = createRouteTestApp(
      "/internal/pessoal/union-notifications",
      createPessoalInternalNotificationRoutes({
        internalServiceToken: "internal-token",
        service: service as never,
      }),
    );

    const response = await request(app).post("/internal/pessoal/union-notifications/run");

    expect(response.status).toBe(401);
    expect(service.runForDate).not.toHaveBeenCalled();
  });

  it("rejeita token interno invalido", async () => {
    const service = {
      runForDate: vi.fn(async () => ({
        organizations: 0,
        unionsMatched: 0,
        notificationsCreated: 0,
        duplicatesSkipped: 0,
      })),
    };
    const app = createRouteTestApp(
      "/internal/pessoal/union-notifications",
      createPessoalInternalNotificationRoutes({
        internalServiceToken: "internal-token",
        service: service as never,
      }),
    );

    const response = await request(app)
      .post("/internal/pessoal/union-notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "wrong-token");

    expect(response.status).toBe(403);
    expect(service.runForDate).not.toHaveBeenCalled();
  });

  it("executa rotina de notificacoes de sindicato com token interno", async () => {
    const result = {
      organizations: 1,
      unionsMatched: 2,
      notificationsCreated: 3,
      duplicatesSkipped: 1,
    };
    const service = {
      runForDate: vi.fn(async () => result),
    };
    const app = createRouteTestApp(
      "/internal/pessoal/union-notifications",
      createPessoalInternalNotificationRoutes({
        internalServiceToken: "internal-token",
        service: service as never,
      }),
    );

    const response = await request(app)
      .post("/internal/pessoal/union-notifications/run")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "internal-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: result });
    expect(service.runForDate).toHaveBeenCalledWith({ now: expect.any(Date) });
  });
});
