import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

function createPrismaMock() {
  return {
    process: {
      findMany: vi.fn(async () => [
        { id: "process-21", process_type: "Abertura", cpf_cnpj: "123", status: "Aberto" },
      ]),
      count: vi.fn(async () => 21),
    },
    sitePasswordsRegularize: {
      findMany: vi.fn(async () => [
        { id: "site-21", name: "Gov", sphere: "Federal", user: "user", status: true },
      ]),
      count: vi.fn(async () => 21),
    },
  };
}

describe("regularize list pagination", () => {
  it("deixa os processos placeholder de orientacao legada fora da lista", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as unknown as PrismaClient);

    await request(app)
      .get("/regularize/processes")
      .query({ status: "Todos" })
      .set(gatewayHeaders());

    expect(prisma.process.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { process_type: { not: "Processo técnico para orientação legada" } },
    });
  });

  it("mantem array legado de processos sem page/limit", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as unknown as PrismaClient);

    const response = await request(app)
      .get("/regularize/processes")
      .query({ status: "Todos" })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(prisma.process.count).not.toHaveBeenCalled();
  });

  it("busca clientes antes de paginar processos", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as unknown as PrismaClient);

    const response = await request(app)
      .get("/regularize/processes")
      .query({ status: "Aberto", search: "acme", page: "2", limit: "20" })
      .set(gatewayHeaders());

    const where = {
      organization_id: "a0000000-0000-4000-8000-000000000001",
      process_type: { not: "Processo técnico para orientação legada" },
      status: { in: ["Andamento", "Aberto", "Em andamento"] },
      OR: [
        { process_type: { contains: "acme", mode: "insensitive" } },
        { cpf_cnpj: { contains: "acme", mode: "insensitive" } },
        { clientPF: { name: { contains: "acme", mode: "insensitive" } } },
        { clientPF: { cpf: { contains: "acme", mode: "insensitive" } } },
        { clientPJ: { name: { contains: "acme", mode: "insensitive" } } },
        { clientPJ: { cpf_cnpj: { contains: "acme", mode: "insensitive" } } },
      ],
    };
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ total: 21, page: 2, limit: 20 });
    expect(prisma.process.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 20 }),
    );
    expect(prisma.process.count).toHaveBeenCalledWith({ where });
  });

  it("pagina sites globais por status e busca", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as unknown as PrismaClient);

    const response = await request(app)
      .get("/regularize/sites-pass")
      .query({ status: "true", search: "gov", page: "2", limit: "20" })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ total: 21, page: 2, limit: 20 });
    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(prisma.sitePasswordsRegularize.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ password: true }),
        where: expect.objectContaining({
          organization_id: "a0000000-0000-4000-8000-000000000001",
          status: true,
          OR: expect.arrayContaining([
            { name: { contains: "gov", mode: "insensitive" } },
            { user: { contains: "gov", mode: "insensitive" } },
          ]),
        }),
        skip: 20,
        take: 20,
      }),
    );
  });

  it("rejeita limites invalidos", async () => {
    const prisma = createPrismaMock();
    const app = createTestApp(prisma as unknown as PrismaClient);

    const response = await request(app)
      .get("/regularize/processes")
      .query({ status: "Todos", limit: "101" })
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
  });
});
