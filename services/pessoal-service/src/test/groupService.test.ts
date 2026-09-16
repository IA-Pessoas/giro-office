import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { GroupService } from "../services/groupService.js";
import { createAuditMock, organizationId, recordId, userId } from "./pessoalCoreTestUtils.js";

function createPrismaMock() {
  return {
    pessoalGroup: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({
        id: recordId,
        name: "Grupo Atual",
        policy: "NORMAL",
        system_key: null,
        archived_at: null,
        organization_id: organizationId,
      })),
      create: vi.fn(async ({ data }) => ({
        id: recordId,
        ...data,
        policy: "NORMAL",
        system_key: null,
        archived_at: null,
      })),
      update: vi.fn(async ({ data }) => ({
        id: recordId,
        name: "Grupo Atual",
        policy: "NORMAL",
        system_key: null,
        archived_at: null,
        organization_id: organizationId,
        ...data,
      })),
      upsert: vi.fn(async () => ({
        id: "group-no-movement",
        name: "Sem Movimento",
        normalized_name: "sem movimento",
        policy: "NO_OBLIGATIONS",
        system_key: "NO_MOVEMENT",
        archived_at: null,
        organization_id: organizationId,
      })),
    },
  };
}

describe("GroupService", () => {
  it("lista apenas grupos da organizacao para Pessoal >= 1 sem escrever", async () => {
    const prisma = createPrismaMock();
    const service = new GroupService(prisma as never, createAuditMock());

    await service.list({ organizationId, userId, permission: 1 });

    expect(prisma.pessoalGroup.upsert).not.toHaveBeenCalled();
    expect(prisma.pessoalGroup.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId },
      orderBy: [{ archived_at: "asc" }, { name: "asc" }],
      select: expect.any(Object),
    });
  });

  it("nega leitura a Viewer sem acessar persistencia", async () => {
    const prisma = createPrismaMock();
    const service = new GroupService(prisma as never, createAuditMock());

    await expect(service.list({ organizationId, userId, permission: 0 })).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(prisma.pessoalGroup.upsert).not.toHaveBeenCalled();
    expect(prisma.pessoalGroup.findMany).not.toHaveBeenCalled();
  });

  it("normaliza unicidade sem alterar a grafia exibida e audita a mutacao", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new GroupService(prisma as never, audit);

    await service.create({ organizationId, userId, permission: 2 }, { name: "  Árvore   Fiscal " });

    expect(prisma.pessoalGroup.create).toHaveBeenCalledWith({
      data: {
        name: "Árvore Fiscal",
        normalized_name: "arvore fiscal",
        policy: "NORMAL",
        organization_id: organizationId,
      },
      select: expect.any(Object),
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Cadastro",
        referring: "pessoal.group",
        organizationId,
        userId,
      }),
    );
  });

  it("arquiva e reativa sem exclusao fisica", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new GroupService(prisma as never, audit);

    await service.archive({ organizationId, userId, permission: 2 }, recordId);
    await service.reactivate({ organizationId, userId, permission: 2 }, recordId);

    expect(prisma.pessoalGroup.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: recordId }, data: { archived_at: expect.any(Date) } }),
    );
    expect(prisma.pessoalGroup.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: recordId }, data: { archived_at: null } }),
    );
    expect(audit.recordChange).toHaveBeenCalledTimes(2);
  });

  it("preserva o nome do grupo sistêmico Sem Movimento", async () => {
    const prisma = createPrismaMock();
    prisma.pessoalGroup.findFirst.mockResolvedValueOnce({
      id: recordId,
      name: "Sem Movimento",
      policy: "NO_OBLIGATIONS",
      system_key: "NO_MOVEMENT",
      archived_at: null,
      organization_id: organizationId,
    } as never);
    const service = new GroupService(prisma as never, createAuditMock());

    await expect(
      service.update({ organizationId, userId, permission: 2 }, recordId, { name: "Outro" }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.pessoalGroup.update).not.toHaveBeenCalled();
  });

  it("altera politica para geracoes futuras sem renomear grupo", async () => {
    const prisma = createPrismaMock();
    const service = new GroupService(prisma as never, createAuditMock());

    await service.update({ organizationId, userId, permission: 2 }, recordId, {
      policy: "NO_OBLIGATIONS",
    });

    expect(prisma.pessoalGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { policy: "NO_OBLIGATIONS" } }),
    );
  });
});
