import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import type { ControlRouteDeps } from "../routes/control.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const CONTROL_ID = "d0000000-0000-4000-8000-000000000001";
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

function bearerToken(permission: number, modules?: Record<string, number>): string {
  const payload: Record<string, unknown> = {
    user_id: USER_ID,
    organization_id: ORG_ID,
    permission,
  };
  if (modules !== undefined) {
    payload.modules = modules;
  }

  return `Bearer ${jwt.sign(payload, env.jwtSecret)}`;
}

function createMockDeps(): ControlRouteDeps {
  return {
    list: vi.fn(async () => ({
      competence: "2024-01",
      items: [],
    })) as unknown as ControlRouteDeps["list"],
    create: vi.fn(async () => ({
      control: { id: CONTROL_ID },
      created: true,
    })) as unknown as ControlRouteDeps["create"],
    detail: vi.fn(async () => ({ id: CONTROL_ID })) as unknown as ControlRouteDeps["detail"],
    updateField: vi.fn(async () => ({
      id: CONTROL_ID,
      depreciation: true,
    })) as unknown as ControlRouteDeps["updateField"],
    createYear: vi.fn(async () => ({
      competences: ["2024-01"],
      created: 1,
      existing: 11,
    })) as unknown as ControlRouteDeps["createYear"],
    archiveCompetence: vi.fn(async () => ({
      controls: 1,
      monthly: 1,
      statements: 0,
      closings: 0,
    })) as unknown as ControlRouteDeps["archiveCompetence"],
    restoreCompetence: vi.fn(async () => ({
      controls: 1,
      monthly: 1,
      statements: 0,
      closings: 0,
    })) as unknown as ControlRouteDeps["restoreCompetence"],
    completeAll: vi.fn(async () => ({
      id: CONTROL_ID,
    })) as unknown as ControlRouteDeps["completeAll"],
  };
}

describe("control routes", () => {
  it("POST /contabil/controls/year exige confirmação e escreve somente no contexto autenticado", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });
    const invalid = await request(app)
      .post("/contabil/controls/year")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, year: 2024, confirmed: false });
    const forged = await request(app)
      .post("/contabil/controls/year")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, year: 2024, confirmed: true, organization_id: "forged" });
    const valid = await request(app)
      .post("/contabil/controls/year")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, year: 2024, confirmed: true });

    expect(invalid.status).toBe(400);
    expect(forged.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(deps.createYear).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, clientId: CLIENT_ID, confirmed: true }),
    );
  });

  it("GET /contabil/controls/list permite viewer e usa somente a organização autenticada", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/controls/list")
      .query({ competence: "2024-01", organization_id: "forged-organization" })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { competence: "2024-01", items: [] } });
    expect(deps.list).toHaveBeenCalledWith("2024-01", ORG_ID);
  });

  it("GET /contabil/controls/list rejeita competência inválida antes de consultar a carteira", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/controls/list")
      .query({ competence: "2024-13" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("GET /contabil/controls/list exige autenticação", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app).get("/contabil/controls/list").query({ competence: "2024-01" });

    expect(res.status).toBe(401);
    expect(deps.list).not.toHaveBeenCalled();
  });

  it("rejeita competência inválida nos contratos de criação e detalhe", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const create = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2024-13" });
    const detail = await request(app)
      .get("/contabil/controls")
      .query({ client_id: CLIENT_ID, competence: "2024-13" })
      .set(gatewayHeaders());

    expect(create.status).toBe(400);
    expect(detail.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.detail).not.toHaveBeenCalled();
  });

  it("GET /contabil/controls permite viewer", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/controls")
      .query({ client_id: CLIENT_ID, competence: "2024-01" })
      .set(gatewayHeaders(0));

    expect(res.status).toBe(200);
    expect(deps.detail).toHaveBeenCalledWith(CLIENT_ID, "2024-01", ORG_ID);
  });

  it("POST /contabil/controls rejeita viewer sem chamar service", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({ client_id: CLIENT_ID, competence: "2024-01" });

    expect(res.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PATCH /contabil/controls/:id rejeita viewer sem chamar service", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(0))
      .send({ field: "depreciation", value: true });

    expect(res.status).toBe(403);
    expect(deps.updateField).not.toHaveBeenCalled();
  });

  it("PATCH /contabil/controls/:id rejeita JWT com permissao global write e contabil viewer", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set("Authorization", bearerToken(1, { contabil: 0 }))
      .send({ field: "depreciation", value: true });

    expect(res.status).toBe(403);
    expect(deps.updateField).not.toHaveBeenCalled();
  });

  it("PATCH /contabil/controls/:id permite JWT legado com permissao global write sem modules", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set("Authorization", bearerToken(2))
      .send({ field: "depreciation", value: true });

    expect(res.status).toBe(200);
    expect(deps.updateField).toHaveBeenCalledWith(
      CONTROL_ID,
      "depreciation",
      true,
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });

  it("POST /contabil/controls sem auth retorna 401", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .send({ client_id: CLIENT_ID, competence: "2024-01" });

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /contabil/controls com gateway e body válido retorna 201 quando criado", async () => {
    const deps = createMockDeps();
    deps.create = vi.fn(async () => ({
      control: { id: CONTROL_ID, client_id: CLIENT_ID },
      created: true,
    })) as unknown as ControlRouteDeps["create"];
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2024-01" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: CONTROL_ID, client_id: CLIENT_ID },
    });
    expect(deps.create).toHaveBeenCalledTimes(1);
  });

  it("POST /contabil/controls retorna 200 quando já existia", async () => {
    const deps = createMockDeps();
    deps.create = vi.fn(async () => ({
      control: { id: CONTROL_ID },
      created: false,
    })) as unknown as ControlRouteDeps["create"];
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2024-01" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("bloqueia visualizador em escritas de controles contábeis", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const post = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({ client_id: CLIENT_ID, competence: "2024-01" });
    const patch = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({ field: "depreciation", value: true });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.updateField).not.toHaveBeenCalled();
  });

  it("POST /contabil/controls com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/controls")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ competence: "2024-01" });

    expect(res.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("GET /contabil/controls sem query válida retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/controls")
      .query({ client_id: "invalid", competence: "2024-01" })
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.detail).not.toHaveBeenCalled();
  });

  it("GET /contabil/controls com query válida retorna 200", async () => {
    const deps = createMockDeps();
    deps.detail = vi.fn(async () => ({ id: CONTROL_ID })) as unknown as ControlRouteDeps["detail"];
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/controls")
      .query({ client_id: CLIENT_ID, competence: "2024-01" })
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.detail).toHaveBeenCalledWith(CLIENT_ID, "2024-01", ORG_ID);
  });

  it("PATCH /contabil/controls/:id com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ field: "depreciation" });

    expect(res.status).toBe(400);
    expect(deps.updateField).not.toHaveBeenCalled();
  });

  it("PATCH /contabil/controls/:id com payload válido retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, controlRouteDeps: deps });

    const res = await request(app)
      .patch(`/contabil/controls/${CONTROL_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ field: "depreciation", value: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.updateField).toHaveBeenCalledWith(
      CONTROL_ID,
      "depreciation",
      true,
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });
});
