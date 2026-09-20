import { createExpressErrorHandler, INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { requireCommercialServiceToken } from "../middlewares/requireCommercialServiceToken.js";
import { createInternalCommercialTaskBillingRouter } from "../routes/internalCommercialTaskBilling.routes.js";

describe("internal commercial task billing route", () => {
  it("exige o token interno antes de encaminhar o evento", async () => {
    const service = { apply: vi.fn() };
    const app = express();
    app.use(express.json());
    app.use(
      "/internal",
      createInternalCommercialTaskBillingRouter(
        service,
        requireCommercialServiceToken({ commercialServiceToken: "task-projection-token" } as never),
      ),
    );
    app.use(
      createExpressErrorHandler({
        logger: { error: vi.fn() } as never,
        event: "task-service.test",
        fallbackMessage: "Erro interno no task-service.",
      }),
    );

    const response = await request(app).post("/internal/commercial/task-billing").send({});

    expect(response.status).toBe(403);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("valida e encaminha evento com token interno", async () => {
    const service = { apply: vi.fn().mockResolvedValue({ applied: true }) };
    const app = express();
    app.use(express.json());
    app.use(
      "/internal",
      createInternalCommercialTaskBillingRouter(
        service,
        requireCommercialServiceToken({ commercialServiceToken: "task-projection-token" } as never),
      ),
    );
    const body = {
      event_id: "c0000000-0000-4000-8000-000000000001",
      event_type: "commercial.task_billing.updated",
      event_version: 1,
      organization_id: "a0000000-0000-4000-8000-000000000001",
      task_id: "b0000000-0000-4000-8000-000000000001",
      hiring_status: "Não Contratado",
      payment: null,
      billing_description: null,
      audit_correlation_id: "audit-1",
      occurred_at: "2026-09-10T12:00:00.000Z",
    };

    const response = await request(app)
      .post("/internal/commercial/task-billing")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "task-projection-token")
      .send(body);

    expect(response.status).toBe(200);
    expect(service.apply).toHaveBeenCalledWith(body);
  });
});
