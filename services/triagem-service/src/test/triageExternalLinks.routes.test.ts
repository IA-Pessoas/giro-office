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
import type { TriageExternalLinkRouteDeps } from "../routes/triageExternalLinks.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const LINK_ID = "d0000000-0000-4000-8000-000000000001";
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

function createMockDeps(): TriageExternalLinkRouteDeps {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: LINK_ID })),
    update: vi.fn(async () => ({ id: LINK_ID })),
    archive: vi.fn(async () => ({ id: LINK_ID })),
  } as unknown as TriageExternalLinkRouteDeps;
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rotas de links externos da Triagem", () => {
  it("cria link e encaminha somente o contexto de organização confiável", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageExternalLinkRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/external-links")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({
        client_id: CLIENT_ID,
        competence: "2026-09",
        type: "DRIVE",
        url: "https://drive.example.test/triagem",
        description: "Pasta mensal",
      });

    expect(response.status).toBe(201);
    expect(deps.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, type: "DRIVE" }),
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    );
  });

  it("rejeita URL HTTP e organização forjada no corpo", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageExternalLinkRouteDeps: deps,
    });

    const response = await request(app)
      .post("/triagem/external-links")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({
        client_id: CLIENT_ID,
        competence: "2026-09",
        type: "DRIVE",
        url: "http://drive.example.test/triagem",
        organization_id: "forged",
      });

    expect(response.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("expõe revisão, arquivamento e listagem com os parâmetros da competência", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageExternalLinkRouteDeps: deps,
    });

    expect(
      (
        await request(app)
          .get("/triagem/external-links")
          .set(authHeaders())
          .query({ client_id: CLIENT_ID, competence: "2026-09" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .put(`/triagem/external-links/${LINK_ID}`)
          .set("Content-Type", "application/json")
          .set(authHeaders())
          .send({
            type: "CLOUD",
            url: "https://cloud.example.test/triagem",
            description: null,
            responsible_id: null,
          })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).patch(`/triagem/external-links/${LINK_ID}/archive`).set(authHeaders()))
        .status,
    ).toBe(200);

    expect(deps.list).toHaveBeenCalledWith(
      { clientId: CLIENT_ID, competence: "2026-09", includeArchived: false },
      expect.any(Object),
    );
    expect(deps.update).toHaveBeenCalledWith(
      LINK_ID,
      expect.objectContaining({ type: "CLOUD" }),
      expect.any(Object),
    );
    expect(deps.archive).toHaveBeenCalledWith(LINK_ID, expect.any(Object));
  });
});
