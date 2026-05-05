import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { NcmServicePrisma } from "../services/ncmService.js";
import { NcmService } from "../services/ncmService.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const NCM_ID = "d0000000-0000-4000-8000-000000000001";

const baseCreateInput = {
  userId: USER_ID,
  organizationId: ORG_ID,
  tax_regime: "Simples Nacional",
  ncm_code: "84719012",
  federal_taxation_type: "Monofásica",
  description: "Unidade de processamento digital",
  validity_start_date: new Date("2026-01-01"),
};

function createMockPrisma(): NcmServicePrisma {
  return {
    ncm: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  } as unknown as NcmServicePrisma;
}

function createMockAudit() {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("NcmService", () => {
  it("create lança 409 quando NCM já existe", async () => {
    const prisma = createMockPrisma();
    prisma.ncm.findFirst = vi.fn(async () => ({ id: NCM_ID })) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const audit = createMockAudit();
    const service = new NcmService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create persiste NCM e registra auditoria", async () => {
    const prisma = createMockPrisma();
    prisma.ncm.findFirst = vi.fn(async () => null) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const created = { id: NCM_ID, ...baseCreateInput };
    prisma.ncm.create = vi.fn(async () => created) as unknown as NcmServicePrisma["ncm"]["create"];
    const audit = createMockAudit();
    const service = new NcmService(prisma, audit);

    const result = await service.create(baseCreateInput);

    expect(result).toEqual({ create: created });
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  it("detail lança 404 quando NCM não existe", async () => {
    const prisma = createMockPrisma();
    prisma.ncm.findFirst = vi.fn(async () => null) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const service = new NcmService(prisma, createMockAudit());

    await expect(service.detail(NCM_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("detail retorna registro quando existe", async () => {
    const row = { id: NCM_ID, ncm_code: "84719012" };
    const prisma = createMockPrisma();
    prisma.ncm.findFirst = vi.fn(async () => row) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const service = new NcmService(prisma, createMockAudit());

    const result = await service.detail(NCM_ID, ORG_ID);
    expect(result).toEqual({ detail: row });
  });

  it("update lança 404 quando NCM não existe", async () => {
    const prisma = createMockPrisma();
    prisma.ncm.findFirst = vi.fn(async () => null) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const service = new NcmService(prisma, createMockAudit());

    await expect(
      service.update({
        ...baseCreateInput,
        ncm_id: NCM_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("update persiste e registra auditoria quando NCM existe", async () => {
    const prisma = createMockPrisma();
    const existing = { id: NCM_ID, ncm_code: "84719012" };
    prisma.ncm.findFirst = vi.fn(async () => existing) as unknown as NcmServicePrisma["ncm"]["findFirst"];
    const updated = { ...existing, description: "Atualizado" };
    prisma.ncm.update = vi.fn(async () => updated) as unknown as NcmServicePrisma["ncm"]["update"];
    const audit = createMockAudit();
    const service = new NcmService(prisma, audit);

    const result = await service.update({
      ...baseCreateInput,
      ncm_id: NCM_ID,
    });

    expect(result).toEqual(updated);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledTimes(1);
  });

  it("list retorna array vazio quando não há códigos", async () => {
    const prisma = createMockPrisma();
    const service = new NcmService(prisma, createMockAudit());

    const result = await service.list([], ORG_ID);
    expect(result).toEqual([]);
  });

  it("list usa filtro in com ncmCodes e organizationId", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createMockPrisma();
    prisma.ncm.findMany = findMany as unknown as NcmServicePrisma["ncm"]["findMany"];
    const service = new NcmService(prisma, createMockAudit());

    await service.list(["84719012", "84713012"], ORG_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    const firstCall = (findMany as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    if (!firstCall) throw new Error("Expected findMany to be called.");
    const arg = firstCall[0] as {
      where: { organization_id: string; ncm_code: { in: string[] } };
    };
    expect(arg.where).toEqual({
      organization_id: ORG_ID,
      ncm_code: { in: ["84719012", "84713012"] },
    });
  });
});
