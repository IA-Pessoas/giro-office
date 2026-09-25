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
const rateId = "e0000000-0000-4000-8000-000000000001";

function headers(permission = 2) {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "audit-service-token",
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function rate() {
  return {
    id: rateId,
    client_id: clientId,
    client_name: "Empresa de Exemplo Ltda",
    client_document: "12.345.678/0001-90",
    competence: "2026-08",
    tax_type: "ISS",
    rate: "5.1250",
    issued_by: userId,
    createdAt: "2026-09-25T12:00:00.000Z",
  };
}

function deps() {
  return {
    create: vi.fn(async () => rate()),
    list: vi.fn(async () => ({ data: [rate()], total: 1, page: 1, limit: 50, hasMore: false })),
    get: vi.fn(async () => rate()),
  };
}

describe("fiscal rate routes", () => {
  it("registra alíquota informada, lista por cliente e baixa o PDF", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, fiscalRateRouteDeps: service });
    const created = await request(app).post("/fiscal/rates").set(headers()).send({
      client_id: clientId,
      competence: "2026-08",
      tax_type: "ISS",
      rate: "5,1250",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.rate).toBe("5.1250");
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId,
        rate: "5,1250",
      }),
    );

    const listed = await request(app)
      .get(`/fiscal/rates/list?client_id=${clientId}`)
      .set(headers(1));
    expect(listed.status).toBe(200);
    expect(listed.body.data.data).toHaveLength(1);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: clientId }),
      organizationId,
    );

    const pdf = await request(app).get(`/fiscal/rates/${rateId}/pdf`).set(headers(1));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(pdf.headers["cache-control"]).toBe("no-store");
    expect(pdf.headers["content-disposition"]).toMatch(/attachment; filename=/);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(service.get).toHaveBeenCalledWith(rateId, organizationId);
  });

  it("rejeita percentual inválido e escrita de visualizador", async () => {
    const service = deps();
    const app = createFiscalApp({ env, logger, fiscalRateRouteDeps: service });
    const payload = { client_id: clientId, competence: "2026-08", tax_type: "ICMS", rate: "101" };
    expect((await request(app).post("/fiscal/rates").set(headers()).send(payload)).status).toBe(
      400,
    );
    expect(
      (
        await request(app)
          .post("/fiscal/rates")
          .set(headers(1))
          .send({ ...payload, rate: "18" })
      ).status,
    ).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });
});
