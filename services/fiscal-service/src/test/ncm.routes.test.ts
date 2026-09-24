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
import type { NcmRouteDeps } from "../routes/ncm.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const NCM_ID = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getFiscalServiceEnv();
const logger = createLogger({
  service: "fiscal-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function gatewayHeaders(permission = 2): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const emptyListResult = { data: [], total: 0, page: 1, limit: 50, hasMore: false };
const validNcmBody = {
  tax_regime: "Simples Nacional",
  ncm_code: "84719012",
  federal_taxation_type: "Monofásica",
  description: "Unidade de processamento",
  validity_start_date: "2026-01-01T00:00:00.000Z",
};

function createMockDeps(): NcmRouteDeps {
  return {
    create: vi.fn(async () => ({ create: {} })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({ deleted: {} })),
    detail: vi.fn(async () => ({ detail: {} })),
    list: vi.fn(async () => emptyListResult),
  };
}

describe("ncm routes", () => {
  it("POST /fiscal/ncm sem token interno retorna 401", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/ncm com auth gateway e body válido retorna 201", async () => {
    const payload = { create: { id: NCM_ID, ncm_code: "84719012" } };
    const deps = createMockDeps();
    deps.create = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const body = {
      tax_regime: "Simples Nacional",
      ncm_code: "84719012",
      federal_taxation_type: "Monofásica",
      description: "Unidade de processamento",
      validity_start_date: "2026-01-01T00:00:00.000Z",
    };

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("POST /fiscal/ncm com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ncm_code: "84719012" });

    expect(res.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST e PUT /fiscal/ncm rejeitam codigo NCM com letras antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const createResponse = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...validNcmBody, ncm_code: "8471.AB" });

    const updateResponse = await request(app)
      .put("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...validNcmBody, ncm_id: NCM_ID, ncm_code: "ABC123" });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    "123",
    "847190121",
  ])("POST e PUT /fiscal/ncm rejeitam codigo NCM %s (≠ 8 digitos)", async (ncmCode) => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const createResponse = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...validNcmBody, ncm_code: ncmCode });

    const updateResponse = await request(app)
      .put("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...validNcmBody, ncm_id: NCM_ID, ncm_code: ncmCode });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("POST e PUT /fiscal/ncm rejeitam vigencia final anterior a inicial", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });
    const body = {
      ...validNcmBody,
      validity_start_date: "2026-01-01T00:00:00.000Z",
      validity_end_date: "2025-01-01T00:00:00.000Z",
    };

    const createResponse = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(body);

    const updateResponse = await request(app)
      .put("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...body, ncm_id: NCM_ID });

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("POST /fiscal/ncm grava o regime pelo codigo legado lido pela tela", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ...validNcmBody, tax_regime: " lucro real " });

    expect(res.status).toBe(201);
    expect(deps.create).toHaveBeenCalledWith(expect.objectContaining({ tax_regime: "2" }));
  });

  it("POST /fiscal/ncm com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /fiscal/ncm com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .put("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/ncm com Editor retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/ncm")
      .query({ ncm_id: NCM_ID })
      .set(gatewayHeaders(2));

    expect(res.status).toBe(403);
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/ncm com Admin fiscal exclui registro", async () => {
    const payload = { deleted: { id: NCM_ID, ncm_code: "84719012" } };
    const deps = createMockDeps();
    deps.delete = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/ncm")
      .query({ ncm_id: NCM_ID })
      .set(gatewayHeaders(3));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.delete).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 3,
      ncm_id: NCM_ID,
    });
  });

  it("GET /fiscal/ncm sem ncm_id válido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm")
      .query({ ncm_id: "invalido" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.detail).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ncm com ncm_id válido retorna 200", async () => {
    const deps = createMockDeps();
    deps.detail = vi.fn(async () => ({ detail: { id: NCM_ID } }));
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm")
      .query({ ncm_id: NCM_ID })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.detail).toHaveBeenCalledTimes(1);
  });

  it("GET /fiscal/ncm/list com ncmCodes retorna 200", async () => {
    const deps = createMockDeps();
    deps.list = vi.fn(async () => ({
      data: [{ id: NCM_ID }],
      total: 1,
      page: 2,
      limit: 1,
      hasMore: false,
    }));
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm/list")
      .query({ ncmCodes: "8471,84713", page: "2", page_size: "1" })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith(
      { ncmCodes: ["8471", "84713"], page: 2, page_size: 1 },
      ORG_ID,
    );
  });

  it("GET /fiscal/ncm/list sem termo retorna listagem paginada", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm/list")
      .query({ page: "2", page_size: "25" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith({ ncmCodes: [], page: 2, page_size: 25 }, ORG_ID);
  });

  it("GET /fiscal/ncm/list com page_size acima do limite retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ncmRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm/list")
      .query({ page_size: "101" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
