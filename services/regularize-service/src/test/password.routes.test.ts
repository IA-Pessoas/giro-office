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

  it("GET /regularize/passwords returns a masked password list", async () => {
    const prisma = {
      passwordRegularize: {
        findMany: vi.fn(async () => [
          {
            id: "pass-1",
            site_id: "e0000000-0000-4000-8000-000000000001",
            notes: "nota",
            site: {
              name: "Portal DF",
              link: "https://df.example.test",
              sphere: "Distrital",
            },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/passwords")
      .set(gatewayHeaders())
      .query({ client_id: "d0000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0]).not.toHaveProperty("login");
    expect(response.body.data[0]).not.toHaveProperty("password");
  });

  it("GET /regularize/sites-pass returns site credentials without password", async () => {
    const prisma = {
      sitePasswordsRegularize: {
        findMany: vi.fn(async () => [
          {
            id: "site-1",
            name: "Portal DF",
            sphere: "Distrital",
            link: "https://df.example.test",
            user: "usuario-site",
            password: "segredo-em-claro",
            status: true,
          },
        ]),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/sites-pass")
      .set(gatewayHeaders())
      .query({ status: "true" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data[0]).toMatchObject({
      id: "site-1",
      name: "Portal DF",
      user: "usuario-site",
    });
    expect(response.body.data[0]).not.toHaveProperty("password");
  });

  it("POST /regularize/sites-pass stores encrypted site password", async () => {
    const encryption = new EncryptionService(regularizeTestEnv.encryptionKey);
    const create = vi.fn(async ({ data }) => ({
      id: "site-1",
      status: true,
      ...data,
    }));
    const prisma = {
      sitePasswordsRegularize: {
        findFirst: vi.fn(async () => null),
        create,
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/sites-pass").set(gatewayHeaders()).send({
      name: "Portal DF",
      sphere: "Distrital",
      link: "https://df.example.test",
      user: "usuario-site",
      password: "segredo-site",
    });

    expect(response.status).toBe(201);
    const createData = create.mock.calls[0]?.[0].data as { password: string };
    expect(createData.password).not.toBe("segredo-site");
    expect(encryption.decrypt(createData.password)).toBe("segredo-site");
  });

  it("PUT /regularize/sites-pass stores encrypted site password and redacts sensitive logs", async () => {
    const encryption = new EncryptionService(regularizeTestEnv.encryptionKey);
    const update = vi.fn(async ({ data }) => ({
      id: "e0000000-0000-4000-8000-000000000001",
      ...data,
    }));
    const logCreate = vi.fn(async () => ({}));
    const prisma = {
      sitePasswordsRegularize: {
        findFirst: vi.fn(async () => ({
          id: "e0000000-0000-4000-8000-000000000001",
          name: "Portal antigo",
          sphere: "Distrital",
          link: "https://old.example.test",
          user: "usuario-antigo",
          password: encryption.encrypt("segredo-antigo"),
          status: true,
        })),
        update,
      },
      logs: {
        create: logCreate,
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).put("/regularize/sites-pass").set(gatewayHeaders()).send({
      id: "e0000000-0000-4000-8000-000000000001",
      name: "Portal novo",
      sphere: "Distrital",
      link: "https://new.example.test",
      user: "usuario-novo",
      password: "segredo-novo",
      status: true,
    });

    expect(response.status).toBe(200);
    const updateData = update.mock.calls[0]?.[0].data as { password: string };
    expect(updateData.password).not.toBe("segredo-novo");
    expect(encryption.decrypt(updateData.password)).toBe("segredo-novo");

    const loggedChanges = JSON.stringify(logCreate.mock.calls[0]?.[0].data.changes);
    expect(loggedChanges).not.toContain("usuario-antigo");
    expect(loggedChanges).not.toContain("usuario-novo");
    expect(loggedChanges).not.toContain("segredo-antigo");
    expect(loggedChanges).not.toContain("segredo-novo");
  });

  it("GET /regularize/sites-pass-detail returns decrypted site password", async () => {
    const encryption = new EncryptionService(regularizeTestEnv.encryptionKey);
    const prisma = {
      sitePasswordsRegularize: {
        findFirst: vi.fn(async () => ({
          id: "e0000000-0000-4000-8000-000000000001",
          name: "Portal DF",
          sphere: "Distrital",
          link: "https://df.example.test",
          user: "usuario-site",
          password: encryption.encrypt("segredo-site"),
          status: true,
        })),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/sites-pass-detail")
      .set(gatewayHeaders())
      .query({ id: "e0000000-0000-4000-8000-000000000001" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.password).toBe("segredo-site");
  });
});
