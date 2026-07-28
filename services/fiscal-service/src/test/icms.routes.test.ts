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
import type { IcmsRouteDeps } from "../routes/icms.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ICMS_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getFiscalServiceEnv();
const logger = createLogger({
  service: "fiscal-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function gatewayHeaders(permission = 1): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

const emptyListResult = { data: [], total: 0, page: 1, limit: 50, hasMore: false };

function createMockDeps(): IcmsRouteDeps {
  return {
    create: vi.fn(async () => ({ create: {} })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({ deleted: {} })),
    detail: vi.fn(async () => ({ detail: {} })),
    list: vi.fn(async () => emptyListResult),
  };
}

describe("icms routes", () => {
  it("POST /fiscal/icms sem token interno retorna 401", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/icms")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/icms com auth gateway e body válido retorna 201", async () => {
    const payload = { create: { id: ICMS_ID, description: "ICMS route test" } };
    const deps = createMockDeps();
    deps.create = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const body = {
      state: "SP",
      item_number: "1001",
      cest_code: "12.345.67",
      description: "ICMS route test",
    };

    const res = await request(app)
      .post("/fiscal/icms")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("POST /fiscal/icms com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/icms")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ description: "sem state" });

    expect(res.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/icms com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/icms")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /fiscal/icms com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .put("/fiscal/icms")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/icms com Editor retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/icms")
      .query({ icms_id: ICMS_ID })
      .set(gatewayHeaders(2));

    expect(res.status).toBe(403);
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/icms com Admin fiscal exclui registro", async () => {
    const payload = { deleted: { id: ICMS_ID, description: "ICMS route test" } };
    const deps = createMockDeps();
    deps.delete = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/icms")
      .query({ icms_id: ICMS_ID })
      .set(gatewayHeaders(3));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.delete).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 3,
      icms_id: ICMS_ID,
    });
  });

  it("GET /fiscal/icms sem icms_id válido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms")
      .query({ icms_id: "invalido" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.detail).not.toHaveBeenCalled();
  });

  it("GET /fiscal/icms com icms_id válido retorna 200", async () => {
    const deps = createMockDeps();
    deps.detail = vi.fn(async () => ({ detail: { id: ICMS_ID } }));
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms")
      .query({ icms_id: ICMS_ID })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.detail).toHaveBeenCalledTimes(1);
  });

  it("GET /fiscal/icms/list com icmsCodes retorna 200", async () => {
    const deps = createMockDeps();
    deps.list = vi.fn(async () => ({
      data: [{ id: ICMS_ID }],
      total: 1,
      page: 2,
      limit: 1,
      hasMore: false,
    }));
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms/list")
      .query({ icmsCodes: "bebida,fria", page: "2", page_size: "1" })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith(
      { icmsCodes: ["bebida", "fria"], page: 2, page_size: 1 },
      ORG_ID,
    );
  });

  it("GET /fiscal/icms/list sem termo retorna listagem paginada", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms/list")
      .query({ page: "2", page_size: "25" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith({ icmsCodes: [], page: 2, page_size: 25 }, ORG_ID);
  });

  it("GET /fiscal/icms/list com page_size acima do limite retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms/list")
      .query({ page_size: "101" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
