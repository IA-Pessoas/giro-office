import "./envBootstrap.js";

import { REGULARIZE_GUIDANCE_CHECKLIST_ITEMS, ServiceError } from "@workspace/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { GuidanceService } from "../services/guidanceService.js";
import { LICENSE_PROTOCOL_MAX_SIZE_BYTES } from "../services/licenseProtocolStorage.js";
import { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

const guidancePayload = {
  target_type: "SEM_CLIENTE" as const,
  target_snapshot: { version: 1 as const, source: "manual" as const, name: "Interessado" },
  checklist: REGULARIZE_GUIDANCE_CHECKLIST_ITEMS.map(({ code }) => ({
    code,
    status: "Pendente" as const,
  })),
  status: "Em andamento" as const,
};

const completeGuidance = {
  id: "d0000000-0000-4000-8000-000000000001",
  process_id: null,
  ...guidancePayload,
  checklist_items: guidancePayload.checklist,
  branch_data: null,
};

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
    ["GET", "/regularize/license/b0000000-0000-4000-8000-000000000001/protocol"],
    ["POST", "/regularize/license/b0000000-0000-4000-8000-000000000001/protocol"],
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

  it("POST /regularize/guidance cria orientação independente e retorna os 17 itens", async () => {
    vi.spyOn(GuidanceService.prototype, "create").mockResolvedValue(completeGuidance);
    const app = createTestApp();

    const response = await request(app)
      .post("/regularize/guidance")
      .set(gatewayHeaders())
      .send(guidancePayload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: completeGuidance });
    expect(response.body.data.checklist_items).toHaveLength(17);
  });

  it("PUT /regularize/guidance mantém 200 e retorna orientação completa", async () => {
    vi.spyOn(GuidanceService.prototype, "update").mockResolvedValue(completeGuidance);
    const app = createTestApp();

    const response = await request(app)
      .put("/regularize/guidance")
      .set(gatewayHeaders())
      .send({ id: completeGuidance.id, ...guidancePayload });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: completeGuidance });
    expect(response.body.data.checklist_items).toHaveLength(17);
  });

  it("GET /regularize/guidance/list encaminha undefined quando process_id está ausente", async () => {
    const listByProcess = vi
      .spyOn(GuidanceService.prototype, "listByProcess")
      .mockResolvedValue([completeGuidance]);
    const app = createTestApp();

    const response = await request(app).get("/regularize/guidance/list").set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([completeGuidance]);
    expect(listByProcess).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      undefined,
      undefined,
    );
  });

  it("GET /regularize/guidance/list preserva o filtro process_id", async () => {
    const processId = "d0000000-0000-4000-8000-000000000002";
    const listByProcess = vi
      .spyOn(GuidanceService.prototype, "listByProcess")
      .mockResolvedValue([completeGuidance]);
    const app = createTestApp();

    const response = await request(app)
      .get("/regularize/guidance/list")
      .query({ process_id: processId })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(listByProcess).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      processId,
      undefined,
    );
  });

  it("GET /regularize/guidance/list trata process_id nulo como ausência de filtro", async () => {
    const listByProcess = vi
      .spyOn(GuidanceService.prototype, "listByProcess")
      .mockResolvedValue([completeGuidance]);
    const app = createTestApp();

    const response = await request(app)
      .get("/regularize/guidance/list")
      .query({ process_id: null })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(listByProcess).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      undefined,
      undefined,
    );
  });

  it("GET /regularize/guidance/list encaminha target_type sem perder o isolamento", async () => {
    const listByProcess = vi
      .spyOn(GuidanceService.prototype, "listByProcess")
      .mockResolvedValue([completeGuidance]);
    const app = createTestApp();

    const response = await request(app)
      .get("/regularize/guidance/list")
      .query({ target_type: "PF" })
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(listByProcess).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000001",
      undefined,
      "PF",
    );
  });

  it("POST /regularize/guidance rejeita chaves extras no snapshot", async () => {
    vi.spyOn(GuidanceService.prototype, "create").mockResolvedValue(completeGuidance);
    const app = createTestApp();

    const response = await request(app)
      .post("/regularize/guidance")
      .set(gatewayHeaders())
      .send({
        ...guidancePayload,
        target_snapshot: { ...guidancePayload.target_snapshot, custom_note: "fora do contrato" },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("custom_note");
    expect(GuidanceService.prototype.create).not.toHaveBeenCalled();
  });

  it("POST /regularize/guidance rejeita dados de filial sem checklist concluído", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/regularize/guidance")
      .set(gatewayHeaders())
      .send({
        ...guidancePayload,
        branch_data: { name: "Filial", address: "Rua A", city: "Salvador", state: "BA" },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("branch_data");
  });

  it("POST /regularize/guidance preserva o conflito de domínio", async () => {
    vi.spyOn(GuidanceService.prototype, "create").mockRejectedValue(
      new ServiceError(409, "Ja existe orientacao em andamento para este processo."),
    );
    const app = createTestApp();

    const response = await request(app)
      .post("/regularize/guidance")
      .set(gatewayHeaders())
      .send(guidancePayload);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Ja existe orientacao em andamento para este processo.");
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

  it("POST /regularize/license/:id/protocol substitui o protocolo sem expor a chave", async () => {
    const licenseId = "b0000000-0000-4000-8000-000000000001";
    const objectPath = `regularize/organizations/a0000000-0000-4000-8000-000000000001/licenses/${licenseId}/protocols/10000000-0000-4000-8000-000000000001.pdf`;
    const transaction = {
      license: { updateMany: vi.fn(async () => ({ count: 1 })) },
      logs: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      license: {
        findFirst: vi.fn(async () => ({ id: licenseId, protocol_file_path: null })),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
    } as unknown as PrismaClient;
    const protocolStorage = {
      upload: vi.fn(async () => objectPath),
      deleteObject: vi.fn(async () => undefined),
      createSignedAccessUrl: vi.fn(),
    };
    const app = createTestApp(prisma, undefined, undefined, protocolStorage as never);

    const response = await request(app)
      .post(`/regularize/license/${licenseId}/protocol`)
      .set(gatewayHeaders())
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "protocolo.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      original_name: "protocolo.pdf",
      mime_type: "application/pdf",
    });
    expect(response.body.data).not.toHaveProperty("path");
    expect(response.body.data).not.toHaveProperty("url");
  });

  it("POST /regularize/license/:id/protocol rejeita formato não permitido", async () => {
    const protocolStorage = {
      upload: vi.fn(),
      deleteObject: vi.fn(),
      createSignedAccessUrl: vi.fn(),
    };
    const app = createTestApp({} as PrismaClient, undefined, undefined, protocolStorage as never);

    const response = await request(app)
      .post("/regularize/license/b0000000-0000-4000-8000-000000000001/protocol")
      .set(gatewayHeaders())
      .attach("file", Buffer.from("executable"), {
        filename: "protocolo.exe",
        contentType: "application/octet-stream",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Formato do protocolo");
    expect(protocolStorage.upload).not.toHaveBeenCalled();
  });

  it("POST /regularize/license/:id/protocol retorna 413 acima de 10 MB", async () => {
    const protocolStorage = {
      upload: vi.fn(),
      deleteObject: vi.fn(),
      createSignedAccessUrl: vi.fn(),
    };
    const app = createTestApp({} as PrismaClient, undefined, undefined, protocolStorage as never);

    const response = await request(app)
      .post("/regularize/license/b0000000-0000-4000-8000-000000000001/protocol")
      .set(gatewayHeaders())
      .attach("file", Buffer.alloc(LICENSE_PROTOCOL_MAX_SIZE_BYTES + 1), {
        filename: "protocolo.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toContain("excede o limite de 10 MB");
    expect(protocolStorage.upload).not.toHaveBeenCalled();
  });

  it("GET /regularize/license/:id/protocol retorna somente URL assinada curta", async () => {
    const licenseId = "b0000000-0000-4000-8000-000000000001";
    const objectPath = `regularize/organizations/a0000000-0000-4000-8000-000000000001/licenses/${licenseId}/protocols/10000000-0000-4000-8000-000000000001.pdf`;
    const prisma = {
      license: {
        findFirst: vi.fn(async () => ({ protocol_file_path: objectPath })),
      },
    } as unknown as PrismaClient;
    const protocolStorage = {
      upload: vi.fn(),
      deleteObject: vi.fn(),
      createSignedAccessUrl: vi.fn(async () => "https://storage.example/signed?token=short"),
    };
    const app = createTestApp(prisma, undefined, undefined, protocolStorage as never);

    const response = await request(app)
      .get(`/regularize/license/${licenseId}/protocol`)
      .set(gatewayHeaders({ permission: 1 }));

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.data).toEqual({
      url: "https://storage.example/signed?token=short",
      expires_in_seconds: 300,
    });
    expect(JSON.stringify(response.body)).not.toContain(objectPath);
  });
});
