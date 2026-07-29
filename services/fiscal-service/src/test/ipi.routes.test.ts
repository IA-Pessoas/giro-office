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
import type { IpiRouteDeps } from "../routes/ipi.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const IPI_ID = "f0000000-0000-4000-8000-000000000001";
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

function createMockDeps(): IpiRouteDeps {
  return {
    create: vi.fn(async () => ({ create: {} })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({ deleted: {} })),
    detail: vi.fn(async () => ({ detail: {} })),
    list: vi.fn(async () => emptyListResult),
  };
}

describe("ipi routes", () => {
  it("POST /fiscal/ipi sem token interno retorna 401", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ipi")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/ipi com auth gateway e body válido retorna 201", async () => {
    const payload = { create: { id: IPI_ID, ncm: "84719012" } };
    const deps = createMockDeps();
    deps.create = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const body = {
      ncm: "84719012",
      ex: "001",
      description: "IPI route test",
      aliquot: "10.00",
    };

    const res = await request(app)
      .post("/fiscal/ipi")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("POST /fiscal/ipi com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ipi")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ description: "sem ncm" });

    expect(res.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/ipi com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ipi")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /fiscal/ipi com Visualizador retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .put("/fiscal/ipi")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({});

    expect(res.status).toBe(403);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/ipi com Editor retorna 403 antes do servico", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/ipi")
      .query({ ipi_id: IPI_ID })
      .set(gatewayHeaders(2));

    expect(res.status).toBe(403);
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("DELETE /fiscal/ipi com Admin fiscal exclui registro", async () => {
    const payload = { deleted: { id: IPI_ID, ncm: "84719012" } };
    const deps = createMockDeps();
    deps.delete = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .delete("/fiscal/ipi")
      .query({ ipi_id: IPI_ID })
      .set(gatewayHeaders(3));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: payload });
    expect(deps.delete).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 3,
      ipi_id: IPI_ID,
    });
  });

  it("GET /fiscal/ipi sem ipi_id válido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ipi")
      .query({ ipi_id: "invalido" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.detail).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ipi com ipi_id válido retorna 200", async () => {
    const deps = createMockDeps();
    deps.detail = vi.fn(async () => ({ detail: { id: IPI_ID } }));
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ipi")
      .query({ ipi_id: IPI_ID })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.detail).toHaveBeenCalledTimes(1);
  });

  it("GET /fiscal/ipi/list com ipiCodes retorna 200", async () => {
    const deps = createMockDeps();
    deps.list = vi.fn(async () => ({
      data: [{ id: IPI_ID }],
      total: 1,
      page: 2,
      limit: 1,
      hasMore: false,
    }));
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ipi/list")
      .query({ ipiCodes: "8471,84719", page: "2", page_size: "1" })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith(
      { ipiCodes: ["8471", "84719"], page: 2, page_size: 1 },
      ORG_ID,
    );
  });

  it("GET /fiscal/ipi/list sem termo retorna listagem paginada", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ipi/list")
      .query({ page: "2", page_size: "25" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.list).toHaveBeenCalledWith({ ipiCodes: [], page: 2, page_size: 25 }, ORG_ID);
  });

  it("GET /fiscal/ipi/list com page_size acima do limite retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, ipiRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ipi/list")
      .query({ page_size: "101" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
