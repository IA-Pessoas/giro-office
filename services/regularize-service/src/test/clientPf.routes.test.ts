import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

describe("regularize client PF and partners routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /regularize/pf creates a record", async () => {
    vi.spyOn(RegularizeReconciliationService.prototype, "handleClientPfChanged").mockResolvedValue(
      undefined,
    );

    const prisma = {
      clientPF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "pf-1",
          code: "001",
          name: "Nome",
          sex: "F",
          address: "Rua A",
          city: "Cidade",
          zip_code: "01001-000",
          state: "SP",
          profession: "Advogada",
          father: "Pai",
          mother: "Mae",
          marital_status: "Solteira",
          date_of_birth: new Date("1990-01-01"),
          cpf: "123",
          rg: "456",
          rg_expedition: null,
          rg_validity: null,
          military_certificate: "",
          ctps: "",
          cnh: "",
          cnh_expedition: null,
          cnh_validity: null,
          spouse: "",
          notes: "",
          status: "Ativo",
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/pf").set(gatewayHeaders()).send({
      code: "001",
      name: "Nome",
      sex: "F",
      address: "Rua A",
      city: "Cidade",
      zip_code: "01001-000",
      state: "SP",
      profession: "Advogada",
      father: "Pai",
      mother: "Mae",
      marital_status: "Solteira",
      date_of_birth: "1990-01-01",
      cpf: "123",
      rg: "456",
      status: "Ativo",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(RegularizeReconciliationService.prototype.handleClientPfChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "pf-1",
    );
  });

  it("GET /regularize/pfs searches, filters and paginates PF clients within the organization", async () => {
    const prisma = {
      clientPF: {
        findMany: vi.fn(async () => [
          { id: "pf-21", code: "021", name: "Ana Silva", cpf: "12345678901" },
        ]),
        count: vi.fn(async () => 21),
      },
    } as unknown as PrismaClient;
    const app = createTestApp(prisma);

    const response = await request(app)
      .get("/regularize/pfs")
      .query({ status: "Ativo", search: "ana", page: "2", limit: "20" })
      .set(gatewayHeaders());

    const where = {
      organization_id: "a0000000-0000-4000-8000-000000000001",
      status: "Ativo",
      OR: [
        { name: { contains: "ana", mode: "insensitive" } },
        { code: { contains: "ana", mode: "insensitive" } },
        { cpf: { contains: "ana", mode: "insensitive" } },
      ],
    };

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      total: 21,
      page: 2,
      limit: 20,
      hasMore: false,
      data: [{ id: "pf-21", name: "Ana Silva" }],
    });
    expect(prisma.clientPF.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 20 }),
    );
    expect(prisma.clientPF.count).toHaveBeenCalledWith({ where });
  });

  it("POST /regularize/partners creates a record", async () => {
    vi.spyOn(RegularizeReconciliationService.prototype, "handlePartnersChanged").mockResolvedValue(
      undefined,
    );

    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "pj-1" })),
      },
      clientPF: {
        findFirst: vi.fn(async () => ({ id: "pf-1" })),
      },
      partners: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "partner-1",
          pj_id: "d0000000-0000-4000-8000-000000000001",
          pf_id: "e0000000-0000-4000-8000-000000000001",
          part: 50,
          entry: new Date("2024-01-01"),
          exit: null,
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/partners").set(gatewayHeaders()).send({
      pj_id: "d0000000-0000-4000-8000-000000000001",
      pf_id: "e0000000-0000-4000-8000-000000000001",
      part: 50,
      entry: "2024-01-01",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(RegularizeReconciliationService.prototype.handlePartnersChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "e0000000-0000-4000-8000-000000000001",
    );
  });
});
