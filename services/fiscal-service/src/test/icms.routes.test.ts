import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
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

function gatewayHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
  };
}

function createMockDeps(): IcmsRouteDeps {
  return {
    create: vi.fn(async () => ({ create: {} })),
    update: vi.fn(async () => ({})),
    detail: vi.fn(async () => ({ detail: {} })),
    list: vi.fn(async () => []),
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
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.detail).toHaveBeenCalledTimes(1);
  });

  it("GET /fiscal/icms/list com icmsCodes retorna 200", async () => {
    const deps = createMockDeps();
    deps.list = vi.fn(async () => [{ id: ICMS_ID }]);
    const app = createFiscalApp({ env, logger, icmsRouteDeps: deps });

    const res = await request(app)
      .get("/fiscal/icms/list")
      .query({ icmsCodes: "ICMS-A,ICMS-B" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
