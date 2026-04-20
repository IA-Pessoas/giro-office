import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { IcmsServicePrisma } from "../services/icmsService.js";
import { IcmsService } from "../services/icmsService.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const ICMS_ID = "e0000000-0000-4000-8000-000000000001";

const baseCreateInput = {
  userId: USER_ID,
  organizationId: ORG_ID,
  state: "SP",
  item_number: "1001",
  cest_code: "12.345.67",
  description: "ICMS smoke description",
  interstate_agreement: "Convênio ICMS",
  applied_original_mva: "10.00",
  adjusted_mva: "12.00",
  original_mva: "8.00",
};

function createMockPrisma(): IcmsServicePrisma {
  return {
    icms: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  } as unknown as IcmsServicePrisma;
}

function createMockAudit() {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("IcmsService", () => {
  it("create lança 409 quando ICMS já existe", async () => {
    const prisma = createMockPrisma();
    prisma.icms.findFirst = vi.fn(async () => ({ id: ICMS_ID }));
    const audit = createMockAudit();
    const service = new IcmsService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create persiste ICMS e registra auditoria", async () => {
    const prisma = createMockPrisma();
    prisma.icms.findFirst = vi.fn(async () => null);
    const created = { id: ICMS_ID, ...baseCreateInput };
    prisma.icms.create = vi.fn(async () => created);
    const audit = createMockAudit();
    const service = new IcmsService(prisma, audit);

    const result = await service.create(baseCreateInput);

    expect(result).toEqual({ create: created });
    expect(audit.createLog).toHaveBeenCalledTimes(1);
  });

  it("detail lança 404 quando ICMS não existe", async () => {
    const prisma = createMockPrisma();
    prisma.icms.findFirst = vi.fn(async () => null);
    const service = new IcmsService(prisma, createMockAudit());

    await expect(service.detail(ICMS_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("detail retorna registro quando existe", async () => {
    const row = { id: ICMS_ID, description: baseCreateInput.description };
    const prisma = createMockPrisma();
    prisma.icms.findFirst = vi.fn(async () => row);
    const service = new IcmsService(prisma, createMockAudit());

    const result = await service.detail(ICMS_ID, ORG_ID);
    expect(result).toEqual({ detail: row });
  });

  it("update lança 404 quando ICMS não existe", async () => {
    const prisma = createMockPrisma();
    prisma.icms.findFirst = vi.fn(async () => null);
    const service = new IcmsService(prisma, createMockAudit());

    await expect(
      service.update({
        ...baseCreateInput,
        icms_id: ICMS_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("update persiste e registra auditoria quando ICMS existe", async () => {
    const prisma = createMockPrisma();
    const existing = { id: ICMS_ID, description: baseCreateInput.description };
    prisma.icms.findFirst = vi.fn(async () => existing);
    const updated = { ...existing, description: "Atualizado" };
    prisma.icms.update = vi.fn(async () => updated);
    const audit = createMockAudit();
    const service = new IcmsService(prisma, audit);

    const result = await service.update({
      ...baseCreateInput,
      icms_id: ICMS_ID,
    });

    expect(result).toEqual(updated);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledTimes(1);
  });

  it("list retorna array vazio quando não há códigos", async () => {
    const prisma = createMockPrisma();
    const service = new IcmsService(prisma, createMockAudit());

    const result = await service.list([], ORG_ID);
    expect(result).toEqual([]);
  });

  it("list usa filtro in com icmsCodes e organizationId", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createMockPrisma();
    prisma.icms.findMany = findMany;
    const service = new IcmsService(prisma, createMockAudit());

    await service.list(["ICMS-A", "ICMS-B"], ORG_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0]?.[0] as {
      where: { organization_id: string; description: { in: string[] } };
    };
    expect(arg.where).toEqual({
      organization_id: ORG_ID,
      description: { in: ["ICMS-A", "ICMS-B"] },
    });
  });
});
