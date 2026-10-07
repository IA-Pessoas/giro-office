import { createLogger } from "@workspace/shared/logger";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { getClientServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { IClientService } from "../services/clientService.js";
import type { HistoryFileStorage } from "../services/historyStorageService.js";

const organizationId = "550e8400-e29b-41d4-a716-446655440000";
const jwtSecret = "test-jwt-secret-for-client-coringa";

beforeAll(() => {
  process.env.JWT_SECRET = jwtSecret;
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-service-role-key";
});

describe("GET /client/coringa/list", () => {
  it("lista clientes da organização autenticada para leitor de Regularize", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { client: { findMany, count } } as unknown as PrismaClient;
    const app = createApp({
      clientService: {} as IClientService,
      prisma,
      env: getClientServiceEnv(),
      logger: createLogger({ service: "client-coringa-test", env: "test", level: "silent" }),
      historyStorage: {} as HistoryFileStorage,
    });
    const token = jwt.sign(
      { user_id: "user-1", organization_id: organizationId, modules: { regularize: 1 } },
      jwtSecret,
    );

    const response = await request(app)
      .get("/client/coringa/list?status=Em%20an%C3%A1lise&tecnologia=false")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: organizationId,
          coringa_status: { equals: "Em análise", mode: "insensitive" },
          tecnologia: false,
        }),
      }),
    );
  });
});

describe("GET /client/coringa/pdf", () => {
  it("exporta os registros filtrados da organização em PDF", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "client-1",
        dominio_code: "123",
        company_name: "Empresa Teste",
        name: "Empresa Teste",
        cpf_cnpj: "12345678000100",
        regime: "Simples Nacional",
        created_at: null,
        size: "ME",
        segment: "Mercado",
        coringa_status: "Em análise",
        status: "Ativo",
        contabil: true,
        fiscal: false,
        pessoal: null,
        tecnologia: true,
        infoproduto: false,
        consultoria: true,
        licitacao: null,
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = { client: { findMany, count } } as unknown as PrismaClient;
    const app = createApp({
      clientService: {} as IClientService,
      prisma,
      env: getClientServiceEnv(),
      logger: createLogger({ service: "client-coringa-test", env: "test", level: "silent" }),
      historyStorage: {} as HistoryFileStorage,
    });
    const token = jwt.sign(
      { user_id: "user-1", organization_id: organizationId, modules: { regularize: 1 } },
      jwtSecret,
    );
    const response = await request(app)
      .get("/client/coringa/pdf?consultoria=true")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(response.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization_id: organizationId, consultoria: true }),
        take: 500,
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ organization_id: organizationId, consultoria: true }),
    });
  });
});

describe("proteção da Lista Coringa", () => {
  function appWithFindMany(findMany = vi.fn().mockResolvedValue([])) {
    const prisma = {
      client: { findMany, count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    return {
      findMany,
      app: createApp({
        clientService: {} as IClientService,
        prisma,
        env: getClientServiceEnv(),
        logger: createLogger({ service: "client-coringa-test", env: "test", level: "silent" }),
        historyStorage: {} as HistoryFileStorage,
      }),
    };
  }

  it("bloqueia acesso anônimo, sem permissão e de outra organização", async () => {
    const { app, findMany } = appWithFindMany();
    const noPermission = jwt.sign(
      { user_id: "user-1", organization_id: organizationId, modules: { regularize: 0 } },
      jwtSecret,
    );
    const allowed = jwt.sign(
      { user_id: "user-1", organization_id: organizationId, modules: { regularize: 1 } },
      jwtSecret,
    );
    const noOrganization = jwt.sign({ user_id: "user-1", modules: { regularize: 1 } }, jwtSecret);
    expect((await request(app).get("/client/coringa/list")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/client/coringa/list")
          .set("Authorization", `Bearer ${noPermission}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(`/client/coringa/list?organization_id=${organizationId}`)
          .set("Authorization", `Bearer ${noOrganization}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/client/coringa/pdf?organization_id=550e8400-e29b-41d4-a716-446655440001")
          .set("Authorization", `Bearer ${allowed}`)
      ).status,
    ).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejeita filtros inválidos antes de consultar os clientes", async () => {
    const { app, findMany } = appWithFindMany();
    const token = jwt.sign(
      { user_id: "user-1", organization_id: organizationId, modules: { regularize: 1 } },
      jwtSecret,
    );
    expect(
      (
        await request(app)
          .get("/client/coringa/list?tecnologia=unknown")
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});
