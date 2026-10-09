import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";

const env = getFiscalServiceEnv();
const logger = createLogger({ service: "fiscal-service", env: env.nodeEnv, level: env.logLevel });
const organizationId = "a0000000-0000-4000-8000-000000000001";
const userId = "c0000000-0000-4000-8000-000000000001";
const clientId = "d0000000-0000-4000-8000-000000000001";
const malhaId = "f0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const malha = {
  id: malhaId,
  client_id: clientId,
  period_start: "2025-01",
  period_end: "2025-12",
  reason: "Divergência",
  deadline: "2026-11-10",
  status: "aberta",
  responsible_id: null,
  task_id: null,
  attachment: null,
  created_by: userId,
  updated_by: userId,
  createdAt: "2026-10-08T12:00:00.000Z",
  updatedAt: "2026-10-08T12:00:00.000Z",
};

function deps() {
  return {
    create: vi.fn(async () => malha),
    update: vi.fn(async () => ({ ...malha, status: "respondida" })),
    list: vi.fn(async () => ({ data: [malha], total: 1, page: 1, limit: 50, hasMore: false })),
    detail: vi.fn(async () => ({ ...malha, history: [] })),
    replaceAttachment: vi.fn(async () => malha),
    attachmentAccess: vi.fn(async () => ({ url: "https://signed", expires_in_seconds: 300 })),
  };
}

describe("fiscal malha routes", () => {
  it("cadastra, lista, detalha e atualiza malhas na organização autenticada", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, malhaRouteDeps: service });

    const created = await request(app).post("/fiscal/malhas").set(headers()).send({
      client_id: clientId,
      period_start: "2025-01",
      period_end: "2025-12",
      reason: "Divergência",
      deadline: "2026-11-10",
    });
    expect(created.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, userId, status: "aberta", client_id: clientId }),
    );

    const listed = await request(app)
      .get(`/fiscal/malhas/list?status=aberta&client_id=${clientId}`)
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "aberta", client_id: clientId }),
      organizationId,
    );

    const detail = await request(app).get(`/fiscal/malhas/${malhaId}`).set(headers(1));
    expect(detail.status).toBe(200);
    expect(service.detail).toHaveBeenCalledWith(malhaId, organizationId);

    const updated = await request(app)
      .put(`/fiscal/malhas/${malhaId}`)
      .set(headers())
      .send({ status: "respondida" });
    expect(updated.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: malhaId, organizationId, status: "respondida" }),
    );
  });

  it("nível 1 consulta mas não altera nem anexa", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, malhaRouteDeps: service });

    const created = await request(app)
      .post("/fiscal/malhas")
      .set(headers(1))
      .send({ client_id: clientId, period_start: "2025-01", period_end: "2025-12", reason: "x" });
    const updated = await request(app)
      .put(`/fiscal/malhas/${malhaId}`)
      .set(headers(1))
      .send({ status: "encerrada" });
    const attached = await request(app)
      .post(`/fiscal/malhas/${malhaId}/attachment`)
      .set(headers(1))
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      });

    expect([created.status, updated.status, attached.status]).toEqual([403, 403, 403]);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.replaceAttachment).not.toHaveBeenCalled();
  });

  it("recusa corpo inválido, situação desconhecida e período invertido", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, malhaRouteDeps: service });

    const inverted = await request(app)
      .post("/fiscal/malhas")
      .set(headers())
      .send({ client_id: clientId, period_start: "2025-12", period_end: "2025-01", reason: "x" });
    const badStatus = await request(app)
      .put(`/fiscal/malhas/${malhaId}`)
      .set(headers())
      .send({ status: "sumiu" });
    const empty = await request(app).put(`/fiscal/malhas/${malhaId}`).set(headers()).send({});
    const extra = await request(app)
      .put(`/fiscal/malhas/${malhaId}`)
      .set(headers())
      .send({ organization_id: "x" });

    expect([inverted.status, badStatus.status, empty.status, extra.status]).toEqual([
      400, 400, 400, 400,
    ]);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it("envia o anexo multipart ao serviço e devolve URL assinada sem cache", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, malhaRouteDeps: service });

    const attached = await request(app)
      .post(`/fiscal/malhas/${malhaId}/attachment`)
      .set(headers())
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "intimacao.pdf",
        contentType: "application/pdf",
      });
    expect(attached.status).toBe(201);
    expect(service.replaceAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        id: malhaId,
        organizationId,
        file: expect.objectContaining({ originalname: "intimacao.pdf", size: 8 }),
      }),
    );

    const access = await request(app).get(`/fiscal/malhas/${malhaId}/attachment`).set(headers(1));
    expect(access.status).toBe(200);
    expect(access.headers["cache-control"]).toBe("no-store");
    expect(access.body.data.url).toBe("https://signed");
  });
});
