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

import { createTriagemApp } from "../app.js";
import { getTriagemServiceEnv } from "../config/env.js";
import type { TriagemPrismaClient } from "../integrations/prisma.js";
import type { TriageUrgentRequestRouteDeps } from "../routes/triageUrgentRequest.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_ID = "c0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "test-audit-token";

const env = getTriagemServiceEnv();
const logger = createLogger({
  service: "triagem-service",
  env: env.nodeEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

function authHeaders(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: INTERNAL_TOKEN,
    [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ triagem: 2 }),
  };
}

function createMockDeps(): TriageUrgentRequestRouteDeps {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: REQUEST_ID })),
    update: vi.fn(async () => ({ id: REQUEST_ID })),
    close: vi.fn(async () => ({ id: REQUEST_ID, status: "CLOSED" })),
    reopen: vi.fn(async () => ({ id: REQUEST_ID, status: "OPEN" })),
  } as unknown as TriageUrgentRequestRouteDeps;
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rotas de solicitações urgentes da Triagem", () => {
  it("cria usando o usuário encaminhado como solicitante", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageUrgentRequestRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/urgent-requests")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({
        client_id: CLIENT_ID,
        competence: "2026-09",
        urgency_code: "HIGH",
        description: "Validar documento urgente.",
        responsible_id: RESPONSIBLE_ID,
      });

    expect(response.status).toBe(201);
    expect(deps.create).toHaveBeenCalledWith(
      {
        client_id: CLIENT_ID,
        competence: "2026-09",
        urgency_code: "HIGH",
        description: "Validar documento urgente.",
        responsible_id: RESPONSIBLE_ID,
      },
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    );
  });

  it("lista por cliente e competência e não aceita corpo forjado", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageUrgentRequestRouteDeps: deps,
    });

    const response = await request(app)
      .get("/triagem/urgent-requests")
      .query({ client_id: CLIENT_ID, competence: "2026-09", status: "OPEN" })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith(
      { clientId: CLIENT_ID, competence: "2026-09", status: "OPEN" },
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
  });

  it("fecha com nota e expõe rota de reabertura", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageUrgentRequestRouteDeps: deps,
    });

    const closeResponse = await request(app)
      .patch(`/triagem/urgent-requests/${REQUEST_ID}/close`)
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({ resolution_note: "Documento validado." });
    const reopenResponse = await request(app)
      .patch(`/triagem/urgent-requests/${REQUEST_ID}/reopen`)
      .set(authHeaders());

    expect(closeResponse.status).toBe(200);
    expect(reopenResponse.status).toBe(200);
    expect(deps.close).toHaveBeenCalledWith(
      REQUEST_ID,
      "Documento validado.",
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(deps.reopen).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("rejeita solicitação sem competência", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageUrgentRequestRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/urgent-requests")
      .set(authHeaders())
      .send({ client_id: CLIENT_ID, urgency_code: "HIGH", description: "Sem competência." });

    expect(response.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("rejeita solicitação sem responsável", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageUrgentRequestRouteDeps: deps,
    });

    const response = await request(app).post("/triagem/urgent-requests").set(authHeaders()).send({
      client_id: CLIENT_ID,
      competence: "2026-09",
      urgency_code: "HIGH",
      description: "Sem responsável.",
    });

    expect(response.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });
});
