import "./envBootstrap.js";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

describe("regularize remaining routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["GET", "/regularize/passwords"],
    ["POST", "/regularize/passwords"],
    ["PUT", "/regularize/passwords"],
    ["GET", "/regularize/password"],
    ["GET", "/regularize/sites-pass"],
    ["POST", "/regularize/sites-pass"],
    ["PUT", "/regularize/sites-pass"],
    ["GET", "/regularize/sites-pass-detail"],
    ["GET", "/regularize/pf"],
    ["POST", "/regularize/pf"],
    ["PUT", "/regularize/pf"],
    ["GET", "/regularize/pfs"],
    ["GET", "/regularize/partners"],
    ["POST", "/regularize/partners"],
    ["PUT", "/regularize/partners"],
    ["GET", "/regularize/partner"],
    ["GET", "/regularize/municipal-taxes"],
    ["POST", "/regularize/municipal-taxes"],
    ["PUT", "/regularize/municipal-taxes"],
    ["GET", "/regularize/municipal-taxes-detail"],
    ["GET", "/regularize/process"],
    ["POST", "/regularize/process"],
    ["PUT", "/regularize/process"],
    ["POST", "/regularize/process/send-to-fiscal"],
    ["POST", "/regularize/process/return-from-fiscal"],
    ["GET", "/regularize/processes"],
    ["POST", "/regularize/guidance"],
    ["PUT", "/regularize/guidance"],
    ["GET", "/regularize/guidance/detail"],
    ["GET", "/regularize/guidance/list"],
    ["POST", "/regularize/guidance/activity/add"],
    ["POST", "/regularize/guidance/activity/remove"],
    ["POST", "/regularize/guidance/partner/add"],
    ["POST", "/regularize/guidance/partner/remove"],
    ["GET", "/regularize/license"],
    ["POST", "/regularize/license"],
    ["PUT", "/regularize/license"],
    ["GET", "/regularize/licenses"],
  ])("%s %s without auth returns 401", async (method, path) => {
    const app = createTestApp();

    const response = await request(app)
      [method.toLowerCase() as "get" | "post" | "put"](path)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("POST /regularize/municipal-taxes creates a municipal taxes record", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      municipalTaxes: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "tax-1",
          client_id: "d0000000-0000-4000-8000-000000000001",
          year: 2025,
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app)
      .post("/regularize/municipal-taxes")
      .set(gatewayHeaders())
      .send({
        client_id: "d0000000-0000-4000-8000-000000000001",
        year: 2025,
        tff_is_applicable: true,
        tff_amount: 100,
        tff_analysis_is_done: false,
        tlp_is_applicable: true,
        tlp_amount: 50,
        tlp_is_sent: "Nao",
        tlp_not_email: false,
        tll_is_applicable: false,
        tll_amount: 0,
        tll_is_sent: "Nao",
        tll_analysis_is_done: false,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/process creates a process", async () => {
    const prisma = {
      process: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "process-1",
          client_pj_id: "d0000000-0000-4000-8000-000000000001",
          client_pf_id: null,
          cpf_cnpj: "12345678901",
          process_type: "Abertura",
          description: "Descricao",
          status: "Andamento",
        })),
      },
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1", cpf_cnpj: "12345678901" })),
      },
      clientPF: {
        findFirst: vi.fn(async () => null),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    prisma.$transaction = vi.fn(async (callback) => callback(prisma));

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/process").set(gatewayHeaders()).send({
      client_pj_id: "d0000000-0000-4000-8000-000000000001",
      cpf_cnpj: "12345678901",
      process_type: "Abertura",
      description: "Descricao",
      status: "Andamento",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/guidance creates a procedural guidance", async () => {
    const prisma = {
      process: {
        findFirst: vi.fn(async () => ({ id: "process-1" })),
      },
      proceduralGuidance: {
        create: vi.fn(async () => ({
          id: "guidance-1",
          process_id: "d0000000-0000-4000-8000-000000000001",
          status: "Em andamento",
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/guidance").set(gatewayHeaders()).send({
      process_id: "d0000000-0000-4000-8000-000000000001",
      status: "Em andamento",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("POST /regularize/license creates a license", async () => {
    vi.spyOn(RegularizeReconciliationService.prototype, "handleLicenseChanged").mockResolvedValue(
      undefined,
    );

    const prisma = {
      client: {
        findFirst: vi.fn(async () => ({ id: "client-1" })),
      },
      license: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "license-1",
          client_id: "d0000000-0000-4000-8000-000000000001",
          has: true,
          type_license: "Alvara",
          entry_date: new Date("2025-01-01"),
          protocol: "PROTO-1",
          status: "Em Andamento",
          current_situation: "Regular",
          contact: "Contato",
          urgency: "Media",
          type: "Anual",
          due_date: new Date("2025-02-01"),
        })),
      },
      logs: {
        create: vi.fn(async () => ({})),
      },
    } as unknown as PrismaClient;

    const app = createTestApp(prisma);

    const response = await request(app).post("/regularize/license").set(gatewayHeaders()).send({
      client_id: "d0000000-0000-4000-8000-000000000001",
      has: true,
      type_license: "Alvara",
      entry_date: "2025-01-01",
      protocol: "PROTO-1",
      status: "Em Andamento",
      current_situation: "Regular",
      contact: "Contato",
      urgency: "Media",
      type: "Anual",
      due_date: "2025-02-01",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(RegularizeReconciliationService.prototype.handleLicenseChanged).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      "license-1",
    );
  });
});
