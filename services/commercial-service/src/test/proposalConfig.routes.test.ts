import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCommercialApp } from "../app.js";
import { getCommercialServiceEnv } from "../config/env.js";
import type { CommercialProposalConfigRouteDeps } from "../routes/proposalConfig.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CONFIG_ID = "d0000000-0000-4000-8000-000000000001";

function createServiceMock(): CommercialProposalConfigRouteDeps {
  return {
    create: vi.fn(async () => ({ id: CONFIG_ID, name: "Padrão", contract_value: 1800 })),
    delete: vi.fn(async () => ({ id: CONFIG_ID, deleted: true as const })),
    detail: vi.fn(async () => ({ id: CONFIG_ID, name: "Padrão", contract_value: 1800 })),
    list: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: CONFIG_ID, name: "Atualizada", contract_value: 2000 })),
  };
}

function createTestLogger() {
  return createLogger({
    service: "commercial-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
  };
}

function createTestApp(service: CommercialProposalConfigRouteDeps) {
  return createCommercialApp({
    env: getCommercialServiceEnv(),
    logger: createTestLogger(),
    proposalConfigService: service,
  });
}

describe("commercial proposal-config routes", () => {
  let service: CommercialProposalConfigRouteDeps;

  beforeEach(() => {
    service = createServiceMock();
  });

  it("GET /health retorna envelope padronizado", async () => {
    const response = await request(createTestApp(service)).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: "ok", service: "commercial-service" },
    });
  });

  it("exige autenticação para listar o catálogo", async () => {
    const response = await request(createTestApp(service)).get("/commercial/proposal-configs");

    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("lista o catálogo usando a organização encaminhada pelo gateway", async () => {
    service.list = vi.fn(async () => [{ id: CONFIG_ID, name: "Padrão", contract_value: 1800 }]);

    const response = await request(createTestApp(service))
      .get("/commercial/proposal-configs")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{ id: CONFIG_ID, name: "Padrão", contract_value: 1800 }],
    });
    expect(service.list).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("valida o payload antes de criar um item", async () => {
    const response = await request(createTestApp(service))
      .post("/commercial/proposal-configs")
      .set(gatewayHeaders())
      .send({ name: "", contract_value: -1 });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("não aceita o nome legado de salário mínimo na API", async () => {
    const response = await request(createTestApp(service))
      .post("/commercial/proposal-configs")
      .set(gatewayHeaders())
      .send({ name: "Padrão", minimum_wage: 1800 });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("cria e atualiza item com identidade do contexto", async () => {
    const app = createTestApp(service);

    const createResponse = await request(app)
      .post("/commercial/proposal-configs")
      .set(gatewayHeaders())
      .send({ name: "Padrão", contract_value: 1800 });

    expect(createResponse.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      name: "Padrão",
      contract_value: 1800,
    });

    const updateResponse = await request(app)
      .patch(`/commercial/proposal-configs/${CONFIG_ID}`)
      .set(gatewayHeaders())
      .send({ contract_value: 2000 });

    expect(updateResponse.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      config_id: CONFIG_ID,
      name: undefined,
      contract_value: 2000,
    });
  });

  it("exclui item com identidade da organização e retorna confirmação", async () => {
    const response = await request(createTestApp(service))
      .delete(`/commercial/proposal-configs/${CONFIG_ID}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: CONFIG_ID, deleted: true },
    });
    expect(service.delete).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      config_id: CONFIG_ID,
    });
  });

  it("exige autenticação para excluir item", async () => {
    const response = await request(createTestApp(service)).delete(
      `/commercial/proposal-configs/${CONFIG_ID}`,
    );

    expect(response.status).toBe(401);
    expect(service.delete).not.toHaveBeenCalled();
  });

  it("propaga conflito de referências da exclusão", async () => {
    service.delete = vi.fn(async () => {
      throw new ServiceError(409, "Configuração possui referências.");
    });

    const response = await request(createTestApp(service))
      .delete(`/commercial/proposal-configs/${CONFIG_ID}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(409);
  });

  it("propaga 404 do service sem vazar dados de outra organização", async () => {
    service.detail = vi.fn(async () => {
      throw new ServiceError(404, "Configuração não encontrada.");
    });

    const response = await request(createTestApp(service))
      .get(`/commercial/proposal-configs/${CONFIG_ID}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(404);
  });
});
