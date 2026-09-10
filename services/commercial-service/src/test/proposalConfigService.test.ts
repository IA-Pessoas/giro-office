import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  type CommercialProposalConfigAuditDeps,
  type CommercialProposalConfigPrismaDeps,
  CommercialProposalConfigService,
} from "../services/proposalConfigService.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CONFIG_ID = "d0000000-0000-4000-8000-000000000001";

function createMockPrisma(): CommercialProposalConfigPrismaDeps {
  return {
    proposalConfig: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as unknown as CommercialProposalConfigPrismaDeps;
}

function createAuditMock(): CommercialProposalConfigAuditDeps {
  return {
    createLog: vi.fn(async () => {}),
    logUpdateIfChanged: vi.fn(async () => {}),
  };
}

describe("CommercialProposalConfigService", () => {
  it("cria o catálogo com a organização do contexto autenticado", async () => {
    const prisma = createMockPrisma();
    prisma.proposalConfig.create = vi.fn(async () => ({
      id: CONFIG_ID,
      name: "Proposta padrão",
      contract_value: 1800,
    }));
    const service = new CommercialProposalConfigService(prisma, createAuditMock());

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        name: "Proposta padrão",
        contract_value: 1800,
      }),
    ).resolves.toEqual({
      id: CONFIG_ID,
      name: "Proposta padrão",
      contract_value: 1800,
    });

    expect(prisma.proposalConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organization_id: ORGANIZATION_ID }),
      }),
    );
  });

  it("não permite que uma organização encontre item de outra organização", async () => {
    const prisma = createMockPrisma();
    const service = new CommercialProposalConfigService(prisma, createAuditMock());

    await expect(service.detail(CONFIG_ID, OTHER_ORGANIZATION_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(prisma.proposalConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONFIG_ID, organization_id: OTHER_ORGANIZATION_ID },
      }),
    );
  });

  it("não permite nomes duplicados dentro da mesma organização", async () => {
    const prisma = createMockPrisma();
    prisma.proposalConfig.findFirst = vi.fn(async () => ({ id: CONFIG_ID }));
    const audit = createAuditMock();
    const service = new CommercialProposalConfigService(prisma, audit);

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        name: "Proposta padrão",
        contract_value: 1800,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.proposalConfig.create).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("converte corrida de unicidade do banco em conflito", async () => {
    const prisma = createMockPrisma();
    prisma.proposalConfig.create = vi.fn(async () => {
      throw { code: "P2002" };
    });
    const service = new CommercialProposalConfigService(prisma, createAuditMock());

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORGANIZATION_ID,
        name: "Proposta padrão",
        contract_value: 1800,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lista somente o catálogo da organização e ordena por nome", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = createMockPrisma();
    prisma.proposalConfig.findMany = findMany;
    const service = new CommercialProposalConfigService(prisma, createAuditMock());

    await service.list(ORGANIZATION_ID);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORGANIZATION_ID },
        orderBy: { name: "asc" },
      }),
    );
  });

  it("atualiza somente dentro da organização autenticada", async () => {
    const prisma = createMockPrisma();
    prisma.proposalConfig.findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: CONFIG_ID, name: "Atual", contract_value: 1800 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: CONFIG_ID, name: "Atualizada", contract_value: 1900 });
    const service = new CommercialProposalConfigService(prisma, createAuditMock());

    await service.update({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      config_id: CONFIG_ID,
      name: "Atualizada",
      contract_value: 1900,
    });

    expect(prisma.proposalConfig.updateMany).toHaveBeenCalledWith({
      where: { id: CONFIG_ID, organization_id: ORGANIZATION_ID },
      data: { name: "Atualizada", contract_value: 1900 },
    });
  });
});
