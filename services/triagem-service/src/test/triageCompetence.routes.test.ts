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
import type { TriageCompetenceRouteDeps } from "../routes/triageCompetence.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const COMPETENCE_ID = "d0000000-0000-4000-8000-000000000001";
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

function createMockDeps(): TriageCompetenceRouteDeps {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: COMPETENCE_ID })),
    archive: vi.fn(async () => ({ id: COMPETENCE_ID })),
  } as unknown as TriageCompetenceRouteDeps;
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rotas de competências da Triagem", () => {
  it("cria competência com contexto de organização encaminhado", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCompetenceRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/competencies")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09" });

    expect(response.status).toBe(201);
    expect(deps.create).toHaveBeenCalledWith(
      { client_id: CLIENT_ID, competence: "2026-09" },
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    );
  });

  it("rejeita corpo com organização forjada", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCompetenceRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/competencies")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({ client_id: CLIENT_ID, competence: "2026-09", organization_id: "forged" });

    expect(response.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("exige autenticação para listar competências", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCompetenceRouteDeps: deps,
    });

    const response = await request(app).get("/triagem/competencies");

    expect(response.status).toBe(401);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
