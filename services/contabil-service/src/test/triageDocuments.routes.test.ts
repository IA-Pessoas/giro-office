import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import { buildContabilServiceOpenApiSpec } from "../openapi/spec.js";
import type { TriageDocumentsRouteDeps } from "../routes/triageDocuments.routes.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const MONTHLY_ID = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "audit-service-token";
const env = getContabilServiceEnv();
const logger = createLogger({
  service: "contabil-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function gatewayHeaders(
  modules: Record<string, number> = { contabil: 2, triagem: 0 },
): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORG_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify(modules),
  };
}

function createMockDeps(): TriageDocumentsRouteDeps {
  return {
    getMonthly: vi.fn(async () => ({ id: MONTHLY_ID })),
    getOrCreateMonthly: vi.fn(async () => ({ id: MONTHLY_ID })),
    updateItem: vi.fn(async () => ({ id: MONTHLY_ID })),
    updateAll: vi.fn(async () => ({ id: MONTHLY_ID })),
    listStatements: vi.fn(async () => []),
    upsertStatement: vi.fn(async () => ({ id: "statement" })),
    archiveStatement: vi.fn(async () => ({ id: "statement", archived_at: "2026-09-17" })),
  } as unknown as TriageDocumentsRouteDeps;
}

describe("triage document routes", () => {
  it("publica cada operação de triagem como path OpenAPI de primeiro nível", () => {
    const spec = buildContabilServiceOpenApiSpec(env);

    expect(spec.paths).toHaveProperty("/triagem/monthly.get");
    expect(spec.paths).toHaveProperty("/triagem/monthly.post.responses.200");
    expect(spec.paths).toHaveProperty("/triagem/monthly/{id}/item.patch");
    expect(spec.paths).toHaveProperty("/triagem/monthly/{id}/items.patch");
    expect(spec.paths).toHaveProperty("/triagem/statements.get");
    expect(spec.paths).toHaveProperty("/triagem/statements.put");
    expect(spec.paths).toHaveProperty("/triagem/statements.delete");
  });

  it("POST /triagem/monthly usa a organização autenticada e os módulos encaminhados", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .post("/triagem/monthly")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09", organization_id: "forged" });

    expect(res.status).toBe(400);
    expect(deps.getOrCreateMonthly).not.toHaveBeenCalled();
  });

  it("POST /triagem/monthly cria com o contexto autenticado", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .post("/triagem/monthly")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders({ contabil: 2, triagem: 1 }))
      .send({ client_id: CLIENT_ID, competence: "2026-09" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: MONTHLY_ID } });
    expect(deps.getOrCreateMonthly).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09" },
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        modules: expect.objectContaining({ contabil: 2, triagem: 1 }),
      }),
    );
  });

  it("POST /triagem/monthly aceita a rotina fiscal explicitamente", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .post("/triagem/monthly")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders({ fiscal: 2, triagem: 1 }))
      .send({ client_id: CLIENT_ID, competence: "2026-09", type: "FISCAL" });

    expect(res.status).toBe(200);
    expect(deps.getOrCreateMonthly).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09", type: "FISCAL" },
      expect.objectContaining({ modules: expect.objectContaining({ fiscal: 2 }) }),
    );
  });

  it("PATCH /triagem/monthly/:id/item rejeita status inválido", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .patch(`/triagem/monthly/${MONTHLY_ID}/item`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ field: "card_statements", status: "INVALID" });

    expect(res.status).toBe(400);
    expect(deps.updateItem).not.toHaveBeenCalled();
  });

  it("PATCH /triagem/monthly/:id/item encaminha nota e justificativa", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .patch(`/triagem/monthly/${MONTHLY_ID}/item`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({
        field: "triaged_transactions",
        status: "ATTENTION",
        note: "Parcial",
        justification: "Aguardando arquivo complementar",
      });

    expect(res.status).toBe(200);
    expect(deps.updateItem).toHaveBeenCalledWith(
      MONTHLY_ID,
      {
        field: "triaged_transactions",
        status: "ATTENTION",
        note: "Parcial",
        justification: "Aguardando arquivo complementar",
      },
      expect.objectContaining({ organizationId: ORG_ID }),
    );
  });

  it("PATCH /triagem/monthly/:id/item encaminha entrega fiscal controlada", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .patch(`/triagem/monthly/${MONTHLY_ID}/item`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders({ fiscal: 2, triagem: 1 }))
      .send({
        type: "FISCAL",
        field: "nfce_documents",
        status: "ATTENTION",
        delivery_method: "EMAIL",
      });

    expect(res.status).toBe(200);
    expect(deps.updateItem).toHaveBeenCalledWith(
      MONTHLY_ID,
      expect.objectContaining({
        type: "FISCAL",
        field: "nfce_documents",
        delivery_method: "EMAIL",
      }),
      expect.objectContaining({ modules: expect.objectContaining({ fiscal: 2 }) }),
    );
  });

  it("PATCH /triagem/monthly/:id/item aceita faturamento fiscal sem status", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .patch(`/triagem/monthly/${MONTHLY_ID}/item`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders({ fiscal: 2, triagem: 1 }))
      .send({ type: "FISCAL", field: "billing_amount", value: "12500,00" });

    expect(res.status).toBe(200);
    expect(deps.updateItem).toHaveBeenCalledWith(
      MONTHLY_ID,
      { type: "FISCAL", field: "billing_amount", value: "12500,00" },
      expect.objectContaining({ modules: expect.objectContaining({ fiscal: 2 }) }),
    );
  });

  it("PATCH /triagem/monthly/:id/item rejeita entrega fiscal desconhecida", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .patch(`/triagem/monthly/${MONTHLY_ID}/item`)
      .set("Content-Type", "application/json")
      .set(gatewayHeaders({ fiscal: 2, triagem: 1 }))
      .send({
        type: "FISCAL",
        field: "nfce_documents",
        status: "ATTENTION",
        delivery_method: "SMS",
      });

    expect(res.status).toBe(400);
    expect(deps.updateItem).not.toHaveBeenCalled();
  });

  it("PUT /triagem/statements mantém bank_id no marcador operacional", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .put("/triagem/statements")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09", bank_id: "341", status: "PENDING" });

    expect(res.status).toBe(200);
    expect(deps.upsertStatement).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09", bank_id: "341", status: "PENDING" },
      expect.objectContaining({ organizationId: ORG_ID }),
    );
  });

  it("DELETE /triagem/statements arquiva o marcador da competência", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .delete("/triagem/statements")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09", bank_id: "341" });

    expect(res.status).toBe(200);
    expect(deps.archiveStatement).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09", bank_id: "341" },
      expect.objectContaining({ organizationId: ORG_ID }),
    );
  });

  it("DELETE /triagem/statements rejeita corpo sem banco", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .delete("/triagem/statements")
      .set("Content-Type", "application/json")
      .set(gatewayHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09" });

    expect(res.status).toBe(400);
    expect(deps.archiveStatement).not.toHaveBeenCalled();
  });

  it("GET /triagem/monthly exige autenticação", async () => {
    const deps = createMockDeps();
    const app = createContabilApp({ env, logger, triageDocumentsRouteDeps: deps });

    const res = await request(app)
      .get("/triagem/monthly")
      .query({ client_id: CLIENT_ID, competence: "2026-09" });

    expect(res.status).toBe(401);
    expect(deps.getMonthly).not.toHaveBeenCalled();
  });
});
