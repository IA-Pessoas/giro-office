import "./envBootstrap.js";

import { createHmac } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createCommercialApp } from "../app.js";
import { getCommercialServiceEnv } from "../config/env.js";
import type { CommercialOutboxRouteDeps } from "../routes/outbox.routes.js";
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
      solution: "CASTELO",
      reference_month: "2026-10",
      service: null,
      description: null,
      participants: null,
      meeting_mode: null,
      branch: null,
      pause_reason: null,
      attachment_name: null,
      attachment_mime_type: null,
      attachment_size_bytes: null,
      client: { id: CLIENT_ID, name: "Cliente", company_name: null, fantasy_name: null },
    })),
    detail: vi.fn(async () => {
      throw new Error("not used");
    }),
    list: vi.fn(async () => ({ items: [], page: 1, page_size: 20, total: 0, total_pages: 0 })),
    listClients: vi.fn(async () => []),
    update: vi.fn(async () => {
      throw new Error("not used");
    }),
    archive: vi.fn(async () => ({ id: PROSPECTING_ID, deleted: true })),
    history: vi.fn(async () => []),
    attachmentAccess: vi.fn(async () => ({
      name: "motivo.pdf",
      url: "https://example.test/signed",
    })),
    uploadAttachment: vi.fn(async () => ({
      name: "motivo.pdf",
      mime_type: "application/pdf",
      size_bytes: 128,
    })),
  };
}

function createTestApp(
  service: CommercialProspectingRouteDeps,
  outboxStatusService?: CommercialOutboxRouteDeps,
) {
  return createCommercialApp({
    env: getCommercialServiceEnv(),
    logger: createLogger({
      service: "commercial-service-test",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
    prospectingService: service,
    outboxStatusService,
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

  it("valida e encaminha os filtros paginados com o tenant autenticado", async () => {
    const service = createServiceMock();
    await request(createTestApp(service))
      .get("/commercial/prospecting?page=2&page_size=25&status=Fechado&search=Acme")
      .set(gatewayHeaders())
      .expect(200);

    expect(service.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      page: 2,
      page_size: 25,
      status: "Fechado",
      search: "Acme",
    });
    await request(createTestApp(service))
      .get("/commercial/prospecting?page_size=101")
      .set(gatewayHeaders())
      .expect(400);
  });

  it("bloqueia acesso direto por JWT à lista que contém dados pessoais", async () => {
    const service = createServiceMock();
    const payload = Buffer.from(
      JSON.stringify({ user_id: USER_ID, organization_id: ORGANIZATION_ID }),
    ).toString("base64url");
    const unsignedToken = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${payload}`;
    const token = `${unsignedToken}.${createHmac("sha256", getCommercialServiceEnv().jwtSecret)
      .update(unsignedToken)
      .digest("base64url")}`;
    const response = await request(createTestApp(service))
      .get("/commercial/prospecting")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
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
      .send({
        client_id: CLIENT_ID,
        status: "Análise Financeira",
        status_date: "2026-10-13T12:00:00.000Z",
        solution: "CASTELO",
        reference_month: "2026-10",
      });

    expect(service.create).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      audit_correlation_id: expect.any(String),
      client_id: CLIENT_ID,
      status: "Análise Financeira",
      status_date: new Date("2026-10-13T12:00:00.000Z"),
      solution: "CASTELO",
      reference_month: "2026-10",
      service: undefined,
      description: undefined,
      participants: undefined,
      meeting_mode: undefined,
      branch: undefined,
      pause_reason: undefined,
    });
  });

  it("rejeita campos extras no payload de criação", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .post("/commercial/prospecting")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, status: "Análise Financeira", unexpected: true });

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("encaminha atualização autenticada ao service", async () => {
    const service = createServiceMock();
    service.update = vi.fn(async () => ({
      id: PROSPECTING_ID,
      client_id: CLIENT_ID,
      status: "Envio de Proposta",
      status_date: null,
      solution: "CASTELO",
      reference_month: "2026-10",
      service: null,
      description: "Retorno confirmado",
      participants: null,
      meeting_mode: null,
      branch: null,
      pause_reason: null,
      attachment_name: null,
      attachment_mime_type: null,
      attachment_size_bytes: null,
      client: { id: CLIENT_ID, name: "Cliente", company_name: null, fantasy_name: null },
    }));

    const response = await request(createTestApp(service))
      .patch(`/commercial/prospecting/${PROSPECTING_ID}`)
      .set(gatewayHeaders())
      .send({ status: "Envio de Proposta", description: "Retorno confirmado" });

    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      audit_correlation_id: expect.any(String),
      prospecting_id: PROSPECTING_ID,
      status: "Envio de Proposta",
      status_date: undefined,
      solution: undefined,
      reference_month: undefined,
      service: undefined,
      description: "Retorno confirmado",
      participants: undefined,
      meeting_mode: undefined,
      branch: undefined,
      pause_reason: undefined,
    });
  });

  it("aceita Fechado SE somente como ação de atualização", async () => {
    const service = createServiceMock();
    service.update = vi.fn(async () => ({
      id: PROSPECTING_ID,
      client_id: CLIENT_ID,
      status: "Fechado",
      status_date: null,
      solution: "CASTELO",
      reference_month: "2026-10",
      service: null,
      description: null,
      participants: null,
      meeting_mode: null,
      branch: null,
      pause_reason: null,
      attachment_name: null,
      attachment_mime_type: null,
      attachment_size_bytes: null,
      client: { id: CLIENT_ID, name: "Cliente", company_name: null, fantasy_name: null },
    }));
    const response = await request(createTestApp(service))
      .patch(`/commercial/prospecting/${PROSPECTING_ID}`)
      .set(gatewayHeaders())
      .send({ status: "Fechado SE" });

    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "Fechado SE", prospecting_id: PROSPECTING_ID }),
    );
    await request(createTestApp(service))
      .post("/commercial/prospecting")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, status: "Fechado SE" })
      .expect(400);
  });

  it("propaga conflito ao tentar reabrir prospecção fechada", async () => {
    const service = createServiceMock();
    service.update = vi.fn(async () => {
      throw new ServiceError(409, "Uma prospecção fechada não pode ser reaberta.");
    });

    const response = await request(createTestApp(service))
      .patch(`/commercial/prospecting/${PROSPECTING_ID}`)
      .set(gatewayHeaders())
      .send({ status: "Envio de Proposta" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Uma prospecção fechada não pode ser reaberta.");
  });

  it("encaminha arquivamento autenticado com contexto tenantizado", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .delete(`/commercial/prospecting/${PROSPECTING_ID}`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: PROSPECTING_ID, deleted: true },
    });
    expect(service.archive).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      audit_correlation_id: expect.any(String),
      prospecting_id: PROSPECTING_ID,
    });
  });

  it("exige autenticação para arquivar prospecção", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service)).delete(
      `/commercial/prospecting/${PROSPECTING_ID}`,
    );

    expect(response.status).toBe(401);
    expect(service.archive).not.toHaveBeenCalled();
  });

  it("rejeita identificador inválido antes de chamar o service", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .delete("/commercial/prospecting/not-a-uuid")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(service.archive).not.toHaveBeenCalled();
  });

  it("lista clientes no tenant encaminhado", async () => {
    const service = createServiceMock();
    await request(createTestApp(service))
      .get("/commercial/prospecting/clients")
      .set(gatewayHeaders());

    expect(service.listClients).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("consulta histórico dentro do tenant autenticado", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .get(`/commercial/prospecting/${PROSPECTING_ID}/history`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(service.history).toHaveBeenCalledWith(PROSPECTING_ID, ORGANIZATION_ID);
  });

  it("emite link de anexo somente para a prospecção do tenant autenticado", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .get(`/commercial/prospecting/${PROSPECTING_ID}/attachment`)
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ name: "motivo.pdf", url: "https://example.test/signed" });
    expect(service.attachmentAccess).toHaveBeenCalledWith(PROSPECTING_ID, ORGANIZATION_ID);
  });

  it("valida e encaminha upload multipart do anexo da prospecção", async () => {
    const service = createServiceMock();
    const response = await request(createTestApp(service))
      .put(`/commercial/prospecting/${PROSPECTING_ID}/attachment`)
      .set(gatewayHeaders())
      .attach("file", Buffer.from("%PDF-1.7\nconteúdo sintético"), {
        filename: "motivo.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(200);
    expect(service.uploadAttachment).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      prospecting_id: PROSPECTING_ID,
      file: expect.objectContaining({
        originalname: "motivo.pdf",
        mimetype: "application/pdf",
        buffer: expect.any(Buffer),
      }),
    });
  });

  it("expõe o estado da outbox somente para o tenant autenticado", async () => {
    const service = createServiceMock();
    const outboxStatusService = {
      status: vi.fn().mockResolvedValue({
        counts: { pending: 1, delivered: 2 },
        latestFailure: null,
      }),
    };

    const response = await request(createTestApp(service, outboxStatusService))
      .get("/commercial/outbox/status")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(outboxStatusService.status).toHaveBeenCalledWith(ORGANIZATION_ID);
  });
});
