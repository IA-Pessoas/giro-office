import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { EncryptionService } from "../services/encryptionService.js";
import { createTestApp, gatewayHeaders, regularizeTestEnv } from "./regularizeTestUtils.js";

describe("regularize password routes", () => {
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

  it("GET /regularize/password reveals an encrypted password detail", async () => {
    const encryption = new EncryptionService(regularizeTestEnv.encryptionKey);
    const prisma = {
      passwordRegularize: {
        findFirst: vi.fn(async () => ({
          id: "f0000000-0000-4000-8000-000000000001",
          client_id: "d0000000-0000-4000-8000-000000000001",
          site_id: "e0000000-0000-4000-8000-000000000001",
          login: encryption.encrypt("login"),
          password: encryption.encrypt("password"),
          notes: "nota",
        })),
      },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/password")
      .set(gatewayHeaders())
      .query({ id: "f0000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.login).toBe("login");
    expect(response.body.data.password).toBe("password");
  });

  it("GET /regularize/password returns 422 for legacy invalid encrypted payload", async () => {
    const prisma = {
      passwordRegularize: {
        findFirst: vi.fn(async () => ({
          id: "f0000000-0000-4000-8000-000000000001",
          client_id: "d0000000-0000-4000-8000-000000000001",
          site_id: "e0000000-0000-4000-8000-000000000001",
          login: "legacy-login",
          password: "legacy-password",
          notes: "Migrado da coluna legada",
        })),
      },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/password")
      .set(gatewayHeaders())
      .query({ id: "f0000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(
      "Credencial indisponivel para revelacao. Atualize o cadastro da senha.",
    );
    expect(JSON.stringify(response.body)).not.toContain("legacy-login");
    expect(JSON.stringify(response.body)).not.toContain("legacy-password");
  });
});
