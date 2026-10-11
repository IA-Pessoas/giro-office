import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";
import type { MarketingEventEditionsProvider } from "../routes/marketingEventEditions.routes.js";
import type {
  MarketingEventEdition,
  MarketingEventEditionReport,
} from "../services/marketingEventEditionsService.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
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

const editionResponse: MarketingEventEdition = {
  id: editionId,
  eventId,
  name: "Edição anual",
  date: "2026-11-12",
  place: "Castelo Branco",
  budgetItems: [],
  budgetTotal: "0.00",
  partnerships: [],
  organizingTeam: [],
  logistics: { fornecedores: [], cronograma: [], registro: [], transporte: [], acomodacoes: [] },
  marketingCommunication: { abertura: [], divulgacao: [], acessoria: [], site: [] },
  duringEvent: { recepcao: [], staff: [], programacao: [], feedback: [] },
  afterEvent: { avaliacao: [], agradecimento: [], relatorio: [], followup: [] },
  notes: "",
  feedbackPeriodStart: null,
  feedbackPeriodEnd: null,
  feedback: null,
};

const reportResponse: MarketingEventEditionReport = {
  event: {
    id: eventId,
    name: "Feira anual",
    logo: "",
    status: "Novo",
    priority: "Média",
    objective: "Apresentar serviços",
    audience: "Comunidade",
  },
  edition: editionResponse,
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
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function service(updateResult: MarketingEventEdition | null = null) {
  return {
    listEditions: vi.fn<MarketingEventEditionsProvider["listEditions"]>(async () => []),
    createEdition: vi.fn<MarketingEventEditionsProvider["createEdition"]>(
      async () => editionResponse,
    ),
    updateEdition: vi.fn<MarketingEventEditionsProvider["updateEdition"]>(async () => updateResult),
    createEditionFeedback: vi.fn<MarketingEventEditionsProvider["createEditionFeedback"]>(
      async () => ({
        rating: 5,
        observation: "Boa edição",
        evaluatedAt: "2026-11-01T12:30:00.000Z",
      }),
    ),
    getEditionReport: vi.fn<MarketingEventEditionsProvider["getEditionReport"]>(
      async () => reportResponse,
    ),
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

  it("returns field-specific validation messages for invalid event and edition IDs", async () => {
    const app = createTestApp(service());
    const invalidEventId = await request(app)
      .get("/marketing/events/not-a-uuid/editions")
      .set(headers());
    const invalidEditionId = await request(app)
      .get(`/marketing/events/${eventId}/editions/not-a-uuid/report`)
      .set(headers());

    expect(invalidEventId.status).toBe(400);
    expect(invalidEventId.body.error).toBe("Identificador do evento inválido.");
    expect(invalidEditionId.status).toBe(400);
    expect(invalidEditionId.body.error).toBe("Identificador da edição inválido.");
  });

  it("creates an edition with edit permission and rejects invalid dates before writing", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const response = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send(body);
    expect(response.status).toBe(201);
    expect(provider.createEdition).toHaveBeenCalledWith(organizationId, eventId, body, userId);

    const invalid = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send({ ...body, date: "2026-02-31" });
    expect(invalid.status).toBe(400);
    expect(provider.createEdition).toHaveBeenCalledTimes(1);
  });

  it("updates an edition and returns the saved edition", async () => {
    const provider = service(editionResponse);
    const response = await request(createTestApp(provider))
      .put(`/marketing/events/${eventId}/editions/${editionId}`)
      .set(headers(2))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: editionResponse });
    expect(provider.updateEdition).toHaveBeenCalledWith(
      organizationId,
      eventId,
      editionId,
      body,
      userId,
    );
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
    expect(provider.updateEdition).toHaveBeenCalledWith(
      organizationId,
      eventId,
      editionId,
      body,
      userId,
    );
  });

  it("rejects a partial or reversed feedback period before writing", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const partial = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send({ ...body, feedbackPeriodStart: "2026-11-02T10:00:00.000Z", feedbackPeriodEnd: null });
    expect(partial.status).toBe(400);

    const reversed = await request(app)
      .post(`/marketing/events/${eventId}/editions`)
      .set(headers(2))
      .send({
        ...body,
        feedbackPeriodStart: "2026-11-03T10:00:00.000Z",
        feedbackPeriodEnd: "2026-11-02T10:00:00.000Z",
      });
    expect(reversed.status).toBe(400);
    expect(provider.createEdition).not.toHaveBeenCalled();
  });

  it("validates feedback ratings and requires editor permission", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const invalid = await request(app)
      .post(`/marketing/events/${eventId}/editions/${editionId}/feedback`)
      .set(headers(2))
      .send({ rating: 6 });
    expect(invalid.status).toBe(400);
    expect(provider.createEditionFeedback).not.toHaveBeenCalled();

    const denied = await request(app)
      .post(`/marketing/events/${eventId}/editions/${editionId}/feedback`)
      .set(headers(1))
      .send({ rating: 5 });
    expect(denied.status).toBe(403);
    expect(provider.createEditionFeedback).not.toHaveBeenCalled();
  });

  it("creates the first evaluation and reports a duplicate conflict", async () => {
    const provider = service();
    const response = await request(createTestApp(provider))
      .post(`/marketing/events/${eventId}/editions/${editionId}/feedback`)
      .set(headers(2))
      .send({ rating: 5, observation: "Boa edição" });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        rating: 5,
        observation: "Boa edição",
        evaluatedAt: "2026-11-01T12:30:00.000Z",
      },
    });
    expect(provider.createEditionFeedback).toHaveBeenCalledWith(
      organizationId,
      eventId,
      editionId,
      {
        rating: 5,
        observation: "Boa edição",
      },
      userId,
    );

    provider.createEditionFeedback.mockRejectedValueOnce(
      new ServiceError(409, "Esta edição já possui uma avaliação."),
    );
    const duplicate = await request(createTestApp(provider))
      .post(`/marketing/events/${eventId}/editions/${editionId}/feedback`)
      .set(headers(2))
      .send({ rating: 4 });
    expect(duplicate.status).toBe(409);
  });

  it("requires viewer permission and hides reports outside the organization or event", async () => {
    const provider = service();
    const app = createTestApp(provider);
    const report = await request(app)
      .get(`/marketing/events/${eventId}/editions/${editionId}/report`)
      .set(headers(1));
    expect(report.status).toBe(200);
    expect(report.body.data).toMatchObject({ event: { id: eventId }, edition: { id: editionId } });
    expect(provider.getEditionReport).toHaveBeenCalledWith(organizationId, eventId, editionId);

    provider.getEditionReport.mockResolvedValueOnce(null);
    const missing = await request(app)
      .get(`/marketing/events/${eventId}/editions/${editionId}/report`)
      .set(headers(1));
    expect(missing.status).toBe(404);
    expect(missing.body.data).toBeUndefined();

    const denied = await request(app)
      .get(`/marketing/events/${eventId}/editions/${editionId}/report`)
      .set(headers(0));
    expect(denied.status).toBe(403);
  });
});
