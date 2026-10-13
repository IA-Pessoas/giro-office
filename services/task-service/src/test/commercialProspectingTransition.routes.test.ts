import "./envBootstrap.js";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { requireCommercialServiceToken } from "../middlewares/requireCommercialServiceToken.js";
import { createInternalCommercialProspectingTransitionRouter } from "../routes/internalCommercialProspectingTransition.routes.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition",
  event_version: 1,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Análise/Agendamento",
  to_status: "Baixada",
  status_date: "2026-09-10T12:00:00.000Z",
  description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-10T12:00:00.000Z",
};

function createApp(service: { apply: ReturnType<typeof vi.fn> }) {
  const app = express();
  app.use(express.json());
  app.use(
    "/internal",
    createInternalCommercialProspectingTransitionRouter(
      service,
      requireCommercialServiceToken({ commercialServiceToken: "commercial-token" } as never),
    ),
  );
  app.use(
    createExpressErrorHandler({
      logger: { error: vi.fn() } as never,
      event: "task-service.test",
      fallbackMessage: "Erro interno no task-service.",
    }),
  );
  return app;
}

describe("internal commercial prospecting transition route", () => {
  it("exige token interno", async () => {
    const service = { apply: vi.fn() };

    const response = await request(createApp(service))
      .post("/internal/commercial/prospecting-transition")
      .send(EVENT);

    expect(response.status).toBe(403);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("aplica uma transição permitida", async () => {
    const service = {
      apply: vi.fn().mockResolvedValue({
        event_id: EVENT.event_id,
        client_id: EVENT.client_id,
        updated_count: 1,
        duplicate: false,
      }),
    };

    const response = await request(createApp(service))
      .post("/internal/commercial/prospecting-transition")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "commercial-token")
      .send(EVENT);

    expect(response.status).toBe(200);
    expect(response.body.data.updated_count).toBe(1);
    expect(service.apply).toHaveBeenCalledWith(EVENT);
  });

  it("não aceita Fechado neste fluxo", async () => {
    const service = { apply: vi.fn() };

    const response = await request(createApp(service))
      .post("/internal/commercial/prospecting-transition")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "commercial-token")
      .send({ ...EVENT, to_status: "Fechado" });

    expect(response.status).toBe(400);
    expect(service.apply).not.toHaveBeenCalled();
  });
});
