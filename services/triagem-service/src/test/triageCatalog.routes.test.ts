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
import type { TriageCatalogRouteDeps } from "../routes/triageCatalog.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CATALOG_ID = "d0000000-0000-4000-8000-000000000001";
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

function createMockDeps(): TriageCatalogRouteDeps {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: CATALOG_ID })),
    update: vi.fn(async () => ({ id: CATALOG_ID })),
    archive: vi.fn(async () => ({ id: CATALOG_ID })),
  } as unknown as TriageCatalogRouteDeps;
}

function createMockPrisma(): TriagemPrismaClient {
  return { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient;
}

describe("rotas de catálogos da Triagem", () => {
  it("lista e encaminha o escopo autenticado", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCatalogRouteDeps: deps,
    });

    const response = await request(app)
      .get("/triagem/catalogs")
      .set(authHeaders())
      .query({ kind: "STATE_SITE", include_archived: "false" });

    expect(response.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith(
      { kind: "STATE_SITE", includeArchived: false },
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    );
  });

  it("valida criação, edição e arquivamento sem aceitar organização no body", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCatalogRouteDeps: deps,
    });

    const invalid = await request(app)
      .post("/triagem/catalogs")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({ kind: "STATE_SITE", code: "SITECODE", label: "Site", organization_id: "forged" });

    expect(invalid.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();

    expect(
      (
        await request(app)
          .post("/triagem/catalogs")
          .set("Content-Type", "application/json")
          .set(authHeaders())
          .send({ kind: "STATE_SITE", code: "SITECODE", label: "Site", url: "https://site.test" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .patch(`/triagem/catalogs/${CATALOG_ID}`)
          .set("Content-Type", "application/json")
          .set(authHeaders())
          .send({ label: "Site revisado" })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).patch(`/triagem/catalogs/${CATALOG_ID}/archive`).set(authHeaders()))
        .status,
    ).toBe(200);

    expect(deps.create).toHaveBeenCalledWith(
      { kind: "STATE_SITE", code: "SITECODE", label: "Site", url: "https://site.test" },
      expect.any(Object),
    );
    expect(deps.update).toHaveBeenCalledWith(
      CATALOG_ID,
      { label: "Site revisado" },
      expect.any(Object),
    );
    expect(deps.archive).toHaveBeenCalledWith(CATALOG_ID, expect.any(Object));
  });

  it("rejeita URL nula no create e corpo de update vazio", async () => {
    const deps = createMockDeps();
    const app = createTriagemApp({
      env,
      logger,
      prisma: createMockPrisma(),
      triageCatalogRouteDeps: deps,
    });

    const nullUrl = await request(app)
      .post("/triagem/catalogs")
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({ kind: "LINK_TYPE", code: "DRIVE", label: "Drive", url: null });
    const emptyUpdate = await request(app)
      .patch(`/triagem/catalogs/${CATALOG_ID}`)
      .set("Content-Type", "application/json")
      .set(authHeaders())
      .send({});

    expect(nullUrl.status).toBe(400);
    expect(emptyUpdate.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
  });
});
