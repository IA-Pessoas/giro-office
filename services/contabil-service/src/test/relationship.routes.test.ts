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
import type { RelationshipRouteDeps } from "../routes/relationship.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const RELATIONSHIP_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getContabilServiceEnv();
const logger = createLogger({
  service: "contabil-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const validBody = {
  client_id: CLIENT_ID,
  bidding: false,
  chart_accounts: "plan",
  tool: "excel",
  system: "local",
  note: "n/a",
};

function gatewayHeaders(permission = 2): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
  };
}

function createMockDeps(): RelationshipRouteDeps {
  return {
    create: vi.fn(async () => ({
      id: RELATIONSHIP_ID,
      client_id: CLIENT_ID,
    })) as unknown as RelationshipRouteDeps["create"],
    update: vi.fn(async () => ({
      id: RELATIONSHIP_ID,
      bidding: true,
    })) as unknown as RelationshipRouteDeps["update"],
    getByClientId: vi.fn(async () => ({
      id: RELATIONSHIP_ID,
    })) as unknown as RelationshipRouteDeps["getByClientId"],
    delete: vi.fn(async () => ({
      message: "Registro deletado com sucesso.",
    })) as unknown as RelationshipRouteDeps["delete"],
  };
}

describe("relationship routes", () => {
  it("POST /contabil/relationships sem auth retorna 401", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/relationships")
      .set("Content-Type", "application/json")
      .send(validBody);

    expect(res.status).toBe(401);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("POST /contabil/relationships com gateway e body válido retorna 201", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/relationships")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: RELATIONSHIP_ID, client_id: CLIENT_ID },
    });
    expect(deps.create).toHaveBeenCalledWith(
      validBody,
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });

  it("bloqueia visualizador em escritas de relacionamentos contábeis", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const post = await request(app)
      .post("/contabil/relationships")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send(validBody);
    const put = await request(app)
      .put(`/contabil/relationships/${RELATIONSHIP_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders(1))
      .send({ note: "updated" });
    const del = await request(app)
      .delete(`/contabil/relationships/${RELATIONSHIP_ID}`)
      .set(gatewayHeaders(1));

    expect(post.status).toBe(403);
    expect(put.status).toBe(403);
    expect(del.status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.delete).not.toHaveBeenCalled();
  });

  it("POST /contabil/relationships com body inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .post("/contabil/relationships")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({});

    expect(res.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("PUT /contabil/relationships/:id sem campos retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .put(`/contabil/relationships/${RELATIONSHIP_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({});

    expect(res.status).toBe(400);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("PUT /contabil/relationships/:id com payload válido retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .put(`/contabil/relationships/${RELATIONSHIP_ID}`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ note: "updated" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.update).toHaveBeenCalledWith(
      RELATIONSHIP_ID,
      { note: "updated" },
      expect.objectContaining({ userId: USER_ID, organizationId: ORG_ID }),
    );
  });

  it("GET /contabil/relationships/client/:clientId com clientId inválido retorna 400", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .get("/contabil/relationships/client/not-a-uuid")
      .set(gatewayHeaders());

    expect(res.status).toBe(400);
    expect(deps.getByClientId).not.toHaveBeenCalled();
  });

  it("GET /contabil/relationships/client/:clientId com auth retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .get(`/contabil/relationships/client/${CLIENT_ID}`)
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(deps.getByClientId).toHaveBeenCalledWith(CLIENT_ID, ORG_ID);
  });

  it("DELETE /contabil/relationships/:id com auth retorna 200", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, relationshipRouteDeps: deps });

    const res = await request(app)
      .delete(`/contabil/relationships/${RELATIONSHIP_ID}`)
      .set(gatewayHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deps.delete).toHaveBeenCalledWith(RELATIONSHIP_ID, ORG_ID);
  });
});
