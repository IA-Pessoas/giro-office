import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  createLogger,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createFiscalApp } from "../app.js";
import { getFiscalServiceEnv } from "../config/env.js";
import type { FiscalRouteDeps } from "../routes/fiscal.routes.js";

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

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

function createMockDeps(): FiscalRouteDeps {
  return {
    ncmService: {
      create: vi.fn(async () => ({ create: {} })),
      update: vi.fn(async () => ({})),
      detail: vi.fn(async () => ({ detail: {} })),
      list: vi.fn(async () => []),
    },
  };
}

describe("fiscal routes — NCM", () => {
  it("POST /fiscal/ncm sem token interno retorna 401", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .send({});

    expect(res.status).toBe(401);
    expect(deps.ncmService.create).not.toHaveBeenCalled();
  });

  it("POST /fiscal/ncm com auth gateway e body válido retorna 201", async () => {
    const payload = { create: { id: NCM_ID, ncm_code: "84719012" } };
    const deps = createMockDeps();
    deps.ncmService.create = vi.fn(async () => payload);
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

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
    expect(deps.ncmService.create).toHaveBeenCalledTimes(1);
  });

  it("POST /fiscal/ncm com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

    const res = await request(app)
      .post("/fiscal/ncm")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ ncm_code: "84719012" });

    expect(res.status).toBe(400);
    expect(deps.ncmService.create).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ncm sem ncm_id válido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm")
      .query({ ncm_id: "invalido" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.ncmService.detail).not.toHaveBeenCalled();
  });

  it("GET /fiscal/ncm com ncm_id válido retorna 200", async () => {
    const deps = createMockDeps();
    deps.ncmService.detail = vi.fn(async () => ({ detail: { id: NCM_ID } }));
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm")
      .query({ ncm_id: NCM_ID })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.ncmService.detail).toHaveBeenCalledTimes(1);
  });

  it("GET /fiscal/ncm/list com ncmCodes retorna 200", async () => {
    const deps = createMockDeps();
    deps.ncmService.list = vi.fn(async () => [{ id: NCM_ID }]);
    const app = createFiscalApp({ env, logger, fiscalRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/ncm/list")
      .query({ ncmCodes: "84719012,84713012" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
