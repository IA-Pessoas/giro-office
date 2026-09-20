import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createCommercialApp } from "../app.js";
import { getCommercialServiceEnv } from "../config/env.js";
import type { CommercialTaskBillingRouteDeps } from "../routes/taskBilling.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const TASK_ID = "b0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";

function headers(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
  };
}

function app(service: CommercialTaskBillingRouteDeps) {
  return createCommercialApp({
    env: getCommercialServiceEnv(),
    logger: createLogger({
      service: "commercial-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    taskBillingService: service,
  });
}

describe("commercial task billing routes", () => {
  it("exige autenticação para atualizar cobrança", async () => {
    const service = { list: vi.fn(), update: vi.fn() };

    const response = await request(app(service)).put(`/commercial/task-billing/${TASK_ID}`).send({
      hiring_status: "Contratado",
    });

    expect(response.status).toBe(401);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("encaminha tenant, usuário e os dados válidos ao service", async () => {
    const service = {
      list: vi.fn(),
      update: vi.fn().mockResolvedValue({ task_id: TASK_ID, hiring_status: "A Realizar" }),
    };

    const response = await request(app(service))
      .put(`/commercial/task-billing/${TASK_ID}`)
      .set(headers())
      .send({ hiring_status: "A Realizar", payment: null, billing_description: "Em análise" });

    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      audit_correlation_id: expect.any(String),
      task_id: TASK_ID,
      hiring_status: "A Realizar",
      payment: null,
      billing_description: "Em análise",
    });
  });

  it("rejeita estado de contratação fora do contrato", async () => {
    const service = { list: vi.fn(), update: vi.fn() };
    const response = await request(app(service))
      .put(`/commercial/task-billing/${TASK_ID}`)
      .set(headers())
      .send({ hiring_status: "Fechado" });

    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
