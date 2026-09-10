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
import type { CommercialProspectingRouteDeps } from "../routes/prospecting.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const PROSPECTING_ID = "d0000000-0000-4000-8000-000000000001";

function createServiceMock(): CommercialProspectingRouteDeps {
  return {
    create: vi.fn(async () => ({
      id: PROSPECTING_ID,
      client_id: CLIENT_ID,
      status: "Análise Financeira",
      status_date: null,
      description: null,
      client: { id: CLIENT_ID, name: "Cliente", company_name: null, fantasy_name: null },
    })),
    detail: vi.fn(async () => {
      throw new Error("not used");
    }),
    list: vi.fn(async () => []),
    listClients: vi.fn(async () => []),
    update: vi.fn(async () => {
      throw new Error("not used");
    }),
  };
}

function createTestApp(service: CommercialProspectingRouteDeps) {
  return createCommercialApp({
    env: getCommercialServiceEnv(),
    logger: createLogger({
      service: "commercial-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    prospectingService: service,
  });
}

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
  };
}

describe("commercial prospecting routes", () => {
  it("exige contexto autenticado", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service)).get("/commercial/prospecting");

    expect(response.status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("valida status e encaminha tenant e usuário ao service", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .post("/commercial/prospecting")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, status: "status inventado" });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();

    await request(createTestApp(service))
      .post("/commercial/prospecting")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, status: "Análise Financeira" });

    expect(service.create).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      client_id: CLIENT_ID,
      status: "Análise Financeira",
      status_date: undefined,
      description: undefined,
    });
  });

  it("lista clientes no tenant encaminhado", async () => {
    const service = createServiceMock();
    await request(createTestApp(service))
      .get("/commercial/prospecting/clients")
      .set(gatewayHeaders());

    expect(service.listClients).toHaveBeenCalledWith(ORGANIZATION_ID);
  });
});
