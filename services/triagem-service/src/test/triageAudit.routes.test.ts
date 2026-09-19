import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTriagemApp } from "../app.js";
import { getTriagemServiceEnv } from "../config/env.js";
import type { TriagemPrismaClient } from "../integrations/prisma.js";
import type { TriageAuditRouteDeps } from "../routes/triageAudit.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
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

function createMockDeps(): TriageAuditRouteDeps {
  return {
    listTimeline: vi.fn(async () => ({ items: [], total: 0, page: 1, page_size: 20 })),
    reconcile: vi.fn(async () => ({ reconciled: 1 })),
  };
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rotas de auditoria da Triagem", () => {
  it("consulta a timeline da competência com contexto e paginação", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageAuditRouteDeps: deps,
    });

    const response = await request(app)
      .get(`/triagem/competencies/${COMPETENCE_ID}/history`)
      .query({ page: "2", page_size: "5" })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(deps.listTimeline).toHaveBeenCalledWith(
      { competenceId: COMPETENCE_ID, page: 2, pageSize: 5 },
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
  });

  it("reconcilia somente com token interno e encaminha o contexto", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageAuditRouteDeps: deps,
    });

    const response = await request(app)
      .post("/internal/triagem/audit/reconcile")
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(deps.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
  });

  it("rejeita token interno inválido mesmo com bearer válido", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageAuditRouteDeps: deps,
    });
    const bearer = jwt.sign(
      {
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        permission: 2,
        modules: { triagem: 2 },
      },
      env.jwtSecret,
    );

    const response = await request(app)
      .post("/internal/triagem/audit/reconcile")
      .set("Authorization", `Bearer ${bearer}`)
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "invalid-internal-token");

    expect(response.status).toBe(403);
    expect(deps.reconcile).not.toHaveBeenCalled();
  });

  it("rejeita paginação inválida antes de consultar o serviço", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageAuditRouteDeps: deps,
    });

    const response = await request(app)
      .get(`/triagem/competencies/${COMPETENCE_ID}/history`)
      .query({ page: "0" })
      .set(authHeaders());

    expect(response.status).toBe(400);
    expect(deps.listTimeline).not.toHaveBeenCalled();
  });
});
