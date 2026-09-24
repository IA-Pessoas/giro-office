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

import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import type { ResponsibleRouteDeps } from "../routes/responsible.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getContabilServiceEnv();
const logger = createLogger({
  service: "contabil-service",
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

function createMockDeps(): ResponsibleRouteDeps {
  return {
    create: vi.fn(async () => ({
      id: RESPONSIBLE_ID,
      client_id: CLIENT_ID,
    })) as unknown as ResponsibleRouteDeps["create"],
    update: vi.fn(async () => ({
      id: RESPONSIBLE_ID,
      customer_with_movement: true,
    })) as unknown as ResponsibleRouteDeps["update"],
    getByClientId: vi.fn(async () => ({
      id: RESPONSIBLE_ID,
    })) as unknown as ResponsibleRouteDeps["getByClientId"],
    delete: vi.fn(async () => ({
      message: "Registro deletado com sucesso.",
    })) as unknown as ResponsibleRouteDeps["delete"],
  };
}

describe("responsible routes", () => {
  it("GET /contabil/responsibles/client/:clientId permite viewer", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .get(`/contabil/responsibles/client/${CLIENT_ID}`)
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(deps.getByClientId).toHaveBeenCalledWith(CLIENT_ID, ORG_ID);
  });

  it("POST /contabil/responsibles rejeita viewer sem chamar service", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/responsibles")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({ client_id: CLIENT_ID });

    expect(res.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /contabil/responsibles/:id rejeita viewer sem chamar service", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .put(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({ customer_with_movement: true });

    expect(res.status).toBe(403);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("DELETE /contabil/responsibles/:id rejeita viewer sem chamar service", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .delete(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set(gatewayHeaders(0));

    expect(res.status).toBe(403);
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("POST /contabil/responsibles sem auth retorna 401", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/responsibles")
      .set("Content-Type", "application/json")
      .send({ client_id: CLIENT_ID });

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /contabil/responsibles com gateway e body válido retorna 201", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/responsibles")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: RESPONSIBLE_ID, client_id: CLIENT_ID },
    });
    expect(deps.create).toHaveBeenCalledWith(
      { client_id: CLIENT_ID },
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });

  it("bloqueia visualizador em escritas de responsáveis contábeis", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const post = await request(app)
      .post("/contabil/responsibles")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({ client_id: CLIENT_ID });
    const put = await request(app)
      .put(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({ customer_with_movement: true });
    const del = await request(app)
      .delete(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set(gatewayHeaders(1));

    expect(post.status).toBe(403);
    expect(put.status).toBe(403);
    expect(del.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("POST /contabil/responsibles com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/responsibles")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({});

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("client_id é obrigatório.");
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /contabil/responsibles/:id sem campos retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .put(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({});

    expect(res.status).toBe(400);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("PUT /contabil/responsibles/:id com payload válido retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .put(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ customer_with_movement: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.update).toHaveBeenCalledWith(
      RESPONSIBLE_ID,
      { customer_with_movement: true },
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });

  it("GET /contabil/responsibles/client/:clientId com clientId inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/responsibles/client/not-a-uuid")
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.getByClientId).not.toHaveBeenCalled();
  });

  it("GET /contabil/responsibles/client/:clientId com auth retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .get(`/contabil/responsibles/client/${CLIENT_ID}`)
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(deps.getByClientId).toHaveBeenCalledWith(CLIENT_ID, ORG_ID);
  });

  it("DELETE /contabil/responsibles/:id com auth retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, responsibleRouteDeps: deps });

    const res = await request(app)
      .delete(`/contabil/responsibles/${RESPONSIBLE_ID}`)
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.delete).toHaveBeenCalledWith(RESPONSIBLE_ID, ORG_ID);
  });
});
