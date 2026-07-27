import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { EncryptionService } from "../services/encryptionService.js";
import { createTestApp, gatewayHeaders, regularizeTestEnv } from "./regularizeTestUtils.js";

describe("regularize password routes", () => {
  const organizationId = "a0000000-0000-4000-8000-000000000001";
  const siteId = "e0000000-0000-4000-8000-000000000001";

  it("POST /regularize/passwords without auth returns 401", async () => {
    const app = createTestApp();

    const response = await request(app).post("/regularize/passwords").send({});

    expect(response.status).toBe(401);
  });

  it("POST /regularize/passwords with gateway auth creates a password", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      sitePasswordsRegularize: {
        findFirst: vi.fn(async () => ({ id: "site-1" })),
      },
      passwordRegularize: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => {
          const encryption = new EncryptionService(regularizeTestEnv.encryptionKey);
          return {
            id: "pass-1",
            client_id: "d0000000-0000-4000-8000-000000000001",
            site_id: "e0000000-0000-4000-8000-000000000001",
            login: encryption.encrypt("login"),
            password: encryption.encrypt("password"),
            notes: "nota",
          };
        }),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/passwords").set(gatewayHeaders()).send({
      client_id: "d0000000-0000-4000-8000-000000000001",
      site_id: "e0000000-0000-4000-8000-000000000001",
      login: "login",
      password: "password",
      notes: "nota",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe("pass-1");
  });

  it("GET /regularize/sites-pass nao expoe password", async () => {
    const findMany = vi.fn(async () => [
      {
        id: siteId,
        name: "Portal",
        sphere: "Federal",
        link: "https://example.com",
        user: "usuario",
        status: true,
      },
    ]);
    const prisma = {
      sitePasswordsRegularize: {
        findMany,
      },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/sites-pass")
      .set(gatewayHeaders())
      .query({ status: true });

    expect(response.status).toBe(200);
    expect(response.body.data[0]).not.toHaveProperty("password");
    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: true },
      select: {
        id: true,
        name: true,
        sphere: true,
        link: true,
        user: true,
        status: true,
      },
      orderBy: { name: "asc" },
    });
  });

  it("GET /regularize/sites-pass-detail bloqueia nivel 0 antes de consultar o banco", async () => {
    const findFirst = vi.fn(async () => null);
    const prisma = {
      sitePasswordsRegularize: { findFirst },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/sites-pass-detail")
      .set(gatewayHeaders(0))
      .query({ id: siteId });

    expect(response.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("GET /regularize/sites-pass-detail revela senha no tenant correto para nivel 1", async () => {
    const findFirst = vi.fn(async () => ({
      id: siteId,
      name: "Portal",
      sphere: "Federal",
      link: "https://example.com",
      user: "usuario",
      password: "segredo",
      status: true,
    }));
    const prisma = {
      sitePasswordsRegularize: { findFirst },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/sites-pass-detail")
      .set(gatewayHeaders(1))
      .query({ id: siteId });

    expect(response.status).toBe(200);
    expect(response.body.data.password).toBe("segredo");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: siteId, organization_id: organizationId },
      select: expect.objectContaining({ password: true }),
    });
  });
});
