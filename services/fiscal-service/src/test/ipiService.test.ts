import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { IpiServicePrisma } from "../services/ipiService.js";
import { IpiService } from "../services/ipiService.js";

const USER_ID = "c0000000-0000-4000-8000-000000000001";
const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const IPI_ID = "f0000000-0000-4000-8000-000000000001";

const baseCreateInput = {
  userId: USER_ID,
  organizationId: ORG_ID,
  ncm: "84719012",
  ex: "001",
  description: "IPI smoke description",
  aliquot: "10.00",
};

const expectedCreateWhere = {
  organization_id: ORG_ID,
  ncm: baseCreateInput.ncm,
  ex: baseCreateInput.ex,
  description: baseCreateInput.description,
  aliquot: baseCreateInput.aliquot,
};

const expectedCreateData = {
  organization_id: ORG_ID,
  ncm: baseCreateInput.ncm,
  ex: baseCreateInput.ex,
  description: baseCreateInput.description,
  aliquot: baseCreateInput.aliquot,
};

const expectedUpdateData = {
  ncm: baseCreateInput.ncm,
  ex: baseCreateInput.ex,
  description: baseCreateInput.description,
  aliquot: baseCreateInput.aliquot,
};

function createMockPrisma(): IpiServicePrisma {
  return {
    ipi: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  } as unknown as IpiServicePrisma;
}

function createMockAudit() {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("IpiService", () => {
  it("create lança 409 quando IPI já existe", async () => {
    const prisma = createMockPrisma();
    prisma.ipi.findFirst = vi.fn(async () => ({
      id: IPI_ID,
    })) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const audit = createMockAudit();
    const service = new IpiService(prisma, audit);

    await expect(service.create(baseCreateInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(audit.createLog).not.toHaveBeenCalled();
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({ where: expectedCreateWhere });
    expect(prisma.ipi.create).not.toHaveBeenCalled();
  });

  it("create persiste IPI e registra auditoria com referring fiscal.ipi", async () => {
    const prisma = createMockPrisma();
    prisma.ipi.findFirst = vi.fn(
      async () => null,
    ) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const created = { id: IPI_ID, ...baseCreateInput };
    prisma.ipi.create = vi.fn(async () => created) as unknown as IpiServicePrisma["ipi"]["create"];
    const audit = createMockAudit();
    const service = new IpiService(prisma, audit);

    const result = await service.create(baseCreateInput);

    expect(result).toEqual({ create: created });
    expect(audit.createLog).toHaveBeenCalledTimes(1);
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        referring: "fiscal.ipi",
        referringId: IPI_ID,
      }),
    );
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({ where: expectedCreateWhere });
    expect(prisma.ipi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedCreateData,
      }),
    );
  });

  it("detail lança 404 quando IPI não existe", async () => {
    const prisma = createMockPrisma();
    prisma.ipi.findFirst = vi.fn(
      async () => null,
    ) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const service = new IpiService(prisma, createMockAudit());

    await expect(service.detail(IPI_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({
      where: { id: IPI_ID, organization_id: ORG_ID },
      select: expect.any(Object),
    });
  });

  it("detail retorna registro quando existe", async () => {
    const row = { id: IPI_ID, ncm: baseCreateInput.ncm };
    const prisma = createMockPrisma();
    prisma.ipi.findFirst = vi.fn(
      async () => row,
    ) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const service = new IpiService(prisma, createMockAudit());

    const result = await service.detail(IPI_ID, ORG_ID);
    expect(result).toEqual({ detail: row });
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({
      where: { id: IPI_ID, organization_id: ORG_ID },
      select: expect.any(Object),
    });
  });

  it("update lança 404 quando IPI não existe", async () => {
    const prisma = createMockPrisma();
    prisma.ipi.findFirst = vi.fn(
      async () => null,
    ) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const service = new IpiService(prisma, createMockAudit());

    await expect(
      service.update({
        ...baseCreateInput,
        ipi_id: IPI_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({
      where: { id: IPI_ID, organization_id: ORG_ID },
    });
    expect(prisma.ipi.update).not.toHaveBeenCalled();
  });

  it("update persiste e registra auditoria quando IPI existe", async () => {
    const prisma = createMockPrisma();
    const existing = { id: IPI_ID, ncm: baseCreateInput.ncm };
    prisma.ipi.findFirst = vi.fn(
      async () => existing,
    ) as unknown as IpiServicePrisma["ipi"]["findFirst"];
    const updated = { ...existing, description: "Atualizado" };
    prisma.ipi.update = vi.fn(async () => updated) as unknown as IpiServicePrisma["ipi"]["update"];
    const audit = createMockAudit();
    const service = new IpiService(prisma, audit);

    const result = await service.update({
      ...baseCreateInput,
      ipi_id: IPI_ID,
    });

    expect(result).toEqual(updated);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledTimes(1);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        referring: "fiscal.ipi",
        referringId: IPI_ID,
      }),
    );
    expect(prisma.ipi.findFirst).toHaveBeenCalledWith({
      where: { id: IPI_ID, organization_id: ORG_ID },
    });
    expect(prisma.ipi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: IPI_ID },
        data: expectedUpdateData,
      }),
    );
  });

  it("list retorna array vazio quando não há códigos", async () => {
    const prisma = createMockPrisma();
    const service = new IpiService(prisma, createMockAudit());

    const result = await service.list([], ORG_ID);
    expect(result).toEqual([]);
  });

  it("list usa filtro ncm in com ipiCodes e organizationId", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createMockPrisma();
    prisma.ipi.findMany = findMany as unknown as IpiServicePrisma["ipi"]["findMany"];
    const service = new IpiService(prisma, createMockAudit());

    await service.list(["84719012", "84719013"], ORG_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    const firstCall = (findMany as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    if (!firstCall) throw new Error("Expected findMany to be called.");
    const arg = firstCall[0] as {
      where: { organization_id: string; ncm: { in: string[] } };
    };
    expect(arg.where).toEqual({
      organization_id: ORG_ID,
      ncm: { in: ["84719012", "84719013"] },
    });
  });
});
