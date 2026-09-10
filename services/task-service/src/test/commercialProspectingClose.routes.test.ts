import "./envBootstrap.js";

import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { requireCommercialServiceToken } from "../middlewares/requireCommercialServiceToken.js";
import { createInternalCommercialProspectingRouter } from "../routes/internalCommercialProspecting.routes.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition",
  event_version: 1,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Envio de Proposta",
  to_status: "Fechado",
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
    createInternalCommercialProspectingRouter(
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

describe("internal commercial prospecting close route", () => {
  it("exige token interno", async () => {
    const service = { apply: vi.fn() };

    const response = await request(createApp(service))
      .post("/internal/commercial/prospecting-close")
      .send(EVENT);

    expect(response.status).toBe(403);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("valida o contrato e devolve a competência", async () => {
    const service = {
      apply: vi.fn().mockResolvedValue({
        event_id: EVENT.event_id,
        client_id: EVENT.client_id,
        competence: "2026-10",
      }),
    };

    const response = await request(createApp(service))
      .post("/internal/commercial/prospecting-close")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "commercial-token")
      .send(EVENT);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      event_id: EVENT.event_id,
      client_id: EVENT.client_id,
      competence: "2026-10",
    });
    expect(service.apply).toHaveBeenCalledWith(EVENT);
  });
});
