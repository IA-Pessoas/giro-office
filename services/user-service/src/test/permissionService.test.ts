import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    $executeRaw: vi.fn(),
    permission: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    permissionSpecific: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { update: vi.fn() },
    logs: { createMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    ),
  },
  auditMock: vi.fn(),
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

import { PermissionService } from "../services/permissionService.js";

describe("PermissionService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof prismaMock) => unknown) => {
        return await callback(prismaMock);
      },
    );
  });

  it("create lança 409 quando permissão já existe", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({ id: "permission-1" });
    const service = new PermissionService();

    await expect(service.create("user-1", "org-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("getByUserId busca permissão dentro da organização", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      fiscal: 2,
    });
    const service = new PermissionService();

    await service.getByUserId("user-1", "fiscal", "org-1");

    expect(prismaMock.permission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: "user-1", organization_id: "org-1" },
        select: expect.not.objectContaining({
          atendimento: true,
          pec: true,
          wiki: true,
        }),
      }),
    );
  });

  it("getByUserId fixa o tenant antes de consultar a permissão", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
    });

    await new PermissionService().getByUserId("user-1", undefined, "org-1");

    expect(prismaMock.$executeRaw).toHaveBeenCalledBefore(prismaMock.permission.findFirst);
  });

  it("update reutiliza a transação tenant-aware fornecida", async () => {
    const transactionMock = {
      permission: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "permission-1",
            user_id: "user-1",
            organization_id: "org-1",
            fiscal: 1,
          })
          .mockResolvedValueOnce({
            id: "permission-1",
            user_id: "user-1",
            organization_id: "org-1",
            fiscal: 2,
          }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      permissionSpecific: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      user: { update: vi.fn() },
      logs: { createMany: vi.fn() },
    };
    prismaMock.permission.findFirst
      .mockResolvedValueOnce({
        id: "permission-1",
        user_id: "user-1",
        organization_id: "org-1",
        fiscal: 1,
      })
      .mockResolvedValueOnce({
        id: "permission-1",
        user_id: "user-1",
        organization_id: "org-1",
        fiscal: 2,
      });
    prismaMock.permission.updateMany.mockResolvedValue({ count: 1 });

    await new PermissionService(undefined, transactionMock).update(
      "user-1",
      { fiscal: 2 },
      "org-1",
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.permission.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      data: { fiscal: 2 },
    });
  });

  it("getByUserId rejeita um módulo de permissão aposentado", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      pec: 2,
    });
    const service = new PermissionService();

    await expect(service.getByUserId("user-1", "pec", "org-1")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("getByUserId lança 403 quando módulo não está liberado", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      certificado: 0,
      comercial: 0,
      contabil: 0,
      financeiro: 0,
      fiscal: 0,
      integracao: 0,
      marketing: 0,
      parcelamento: 0,
      pessoal: 0,
      regularize: 0,
      rh: 0,
      ti: 0,
      triagem: 0,
    });
    const service = new PermissionService();

    await expect(service.getByUserId("user-1", "fiscal", "org-1")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("update altera permissões apenas na organização informada", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      fiscal: 1,
    });
    prismaMock.permission.updateMany.mockResolvedValue({ count: 1 });
    const service = new PermissionService();

    await service.update("user-1", { fiscal: 2 }, "org-1");

    expect(prismaMock.permission.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      data: expect.objectContaining({ fiscal: 2 }),
    });
  });

  it("update repassa permissao de TI para o Prisma", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      ti: null,
    });
    prismaMock.permission.updateMany.mockResolvedValue({ count: 1 });
    const service = new PermissionService();

    await service.update("user-1", { ti: 3 }, "org-1");

    expect(prismaMock.permission.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      data: expect.objectContaining({ ti: 3 }),
    });
  });

  it("atualiza sessão e registra auditoria na mesma transação", async () => {
    prismaMock.permission.findFirst
      .mockResolvedValueOnce({
        id: "permission-1",
        user_id: "user-1",
        organization_id: "org-1",
        fiscal: 1,
      })
      .mockResolvedValueOnce({
        id: "permission-1",
        user_id: "user-1",
        organization_id: "org-1",
        fiscal: 2,
      });
    prismaMock.permission.updateMany.mockResolvedValue({ count: 1 });
    const service = new PermissionService(auditMock);

    await service.update("user-1", { fiscal: 2 }, "org-1", { actorUserId: "actor-1" });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { session_version: { increment: 1 } },
    });
    expect(prismaMock.logs.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            user_id: "actor-1",
            organization_id: "org-1",
            referring: "Permission",
            referring_id: "user-1",
            changes: expect.objectContaining({
              affected_user_id: "user-1",
              organization_id: "org-1",
              previous: expect.objectContaining({ fiscal: 1 }),
              next: expect.objectContaining({ fiscal: 2 }),
            }),
          }),
        ],
      }),
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "actor-1",
        organizationId: "org-1",
        action: "UPDATE",
        referring: "Permission",
        referringId: "user-1",
        outcome: "success",
        changes: expect.objectContaining({
          affected_user_id: "user-1",
          previous: expect.objectContaining({ fiscal: 1 }),
          next: expect.objectContaining({ fiscal: 2 }),
        }),
      }),
    );
  });

  it("createSpecific fixa o tenant antes de consultar PermissionSpecific", async () => {
    prismaMock.permissionSpecific.findFirst.mockResolvedValue(null);
    prismaMock.permissionSpecific.create.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      task_completion: null,
    });

    await new PermissionService().createSpecific("user-1", "org-1");

    expect(prismaMock.$executeRaw).toHaveBeenCalledBefore(prismaMock.permissionSpecific.findFirst);
    expect(prismaMock.permissionSpecific.findFirst).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
    });
  });

  it("updateSpecific compartilha a transação tenant-aware e limita o tenant", async () => {
    const transactionMock = {
      permission: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
      permissionSpecific: {
        findFirst: vi.fn().mockResolvedValue({
          user_id: "user-1",
          organization_id: "org-1",
          task_completion: true,
        }),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: vi.fn() },
      logs: { createMany: vi.fn() },
    };

    await new PermissionService(undefined, transactionMock).updateSpecific("user-1", true, "org-1");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.permissionSpecific.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      data: { task_completion: true },
    });
  });

  it("getSpecific fixa o tenant antes de consultar PermissionSpecific", async () => {
    prismaMock.permissionSpecific.findFirst.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      task_completion: true,
    });

    await new PermissionService().getSpecific("user-1", "org-1");

    expect(prismaMock.$executeRaw).toHaveBeenCalledBefore(prismaMock.permissionSpecific.findFirst);
    expect(prismaMock.permissionSpecific.findFirst).toHaveBeenCalledWith({
      where: { user_id: "user-1", organization_id: "org-1" },
      select: expect.any(Object),
    });
  });
});
