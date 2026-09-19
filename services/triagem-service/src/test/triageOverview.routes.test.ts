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
import type { TriageOverviewRouteDeps } from "../routes/triageOverview.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
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
    [FORWARDED_AUTH_PERMISSION_HEADER]: "1",
    [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ triagem: 1 }),
  };
}

function createMockDeps(): TriageOverviewRouteDeps {
  return {
    list: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 2,
      page_size: 10,
      indicators: {
        urgent_open: 0,
        routine_pending: 0,
        bank_pending: 0,
        complete: 0,
      },
    })),
  };
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rota do painel consolidado da Triagem", () => {
  it("valida filtros, paginação e encaminha o contexto da organização", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageOverviewRouteDeps: deps,
    });

    const response = await request(app)
      .get("/triagem/overview")
      .query({
        page: "2",
        page_size: "10",
        client_id: CLIENT_ID,
        competence: "2026-09",
        status: "COMPLETE",
      })
      .set(authHeaders());

    expect(response.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith(
      {
        page: 2,
        pageSize: 10,
        clientId: CLIENT_ID,
        competence: "2026-09",
        status: "COMPLETE",
      },
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
    );
  });

  it("rejeita paginação inválida antes de chamar o serviço", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageOverviewRouteDeps: deps,
    });

    const response = await request(app)
      .get("/triagem/overview")
      .query({ page: "0" })
      .set(authHeaders());

    expect(response.status).toBe(400);
    expect(deps.list).not.toHaveBeenCalled();
  });
});
