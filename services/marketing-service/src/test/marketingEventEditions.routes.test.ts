import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";
import type { MarketingEventEditionsProvider } from "../routes/marketingEventEditions.routes.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000001";
const editionId = "30000000-0000-4000-8000-000000000001";
const body = {
  name: "Edição anual",
  date: "2026-11-12",
  place: "Castelo Branco",
  budgetItems: [],
  partnerships: [],
  organizingTeam: [],
  logistics: { fornecedores: [], cronograma: [], registro: [], transporte: [], acomodacoes: [] },
  marketingCommunication: { abertura: [], divulgacao: [], acessoria: [], site: [] },
  duringEvent: { recepcao: [], staff: [], programacao: [], feedback: [] },
  afterEvent: { avaliacao: [], agradecimento: [], relatorio: [], followup: [] },
  notes: "",
};

function createTestApp(editionsService: MarketingEventEditionsProvider) {
  return createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createLogger({
      service: "marketing-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    editionsService,
  });
}

function headers(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: "00000000-0000-4000-8000-000000000001",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function service() {
  return {
    listEditions: vi.fn(async () => []),
    createEdition: vi.fn(async () => ({ id: editionId })),
    updateEdition: vi.fn(async () => null),
  };
}

describe("Marketing event editions routes", () => {
  it("lists editions within the authenticated organization", async () => {
    const provider = service();
    const response = await request(createTestApp(provider))
      .get(`/marketing/events/${eventId}/editions`)
      .set(headers());
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
    expect(provider.listEditions).toHaveBeenCalledWith(organizationId, eventId);
  });

  it("creates an edition with edit permission and rejects invalid dates before writing", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const response = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send(body);
    expect(response.status).toBe(201);
    expect(provider.createEdition).toHaveBeenCalledWith(organizationId, eventId, body);

    const invalid = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send({ ...body, date: "2026-02-31" });
    expect(invalid.status).toBe(400);
    expect(provider.createEdition).toHaveBeenCalledTimes(1);
  });

  it("requires edit permission and hides editions not in the organization or event", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const denied = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(1))
      .send(body);
    expect(denied.status).toBe(403);
    expect(provider.createEdition).not.toHaveBeenCalled();

    const missing = await request(app)
      .put(`/marketing/events/${eventId}/editions/${editionId}`)
      .set(headers(2))
      .send(body);
    expect(missing.status).toBe(404);
    expect(provider.updateEdition).toHaveBeenCalledWith(organizationId, eventId, editionId, body);
  });
});
