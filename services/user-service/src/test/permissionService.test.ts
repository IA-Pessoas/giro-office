import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    permission: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    permissionSpecific: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: { update: vi.fn() },
    logs: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof prismaMock) => unknown) =>
      callback(prismaMock),
    ),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

import { PermissionService } from "../services/permissionService.js";

describe("PermissionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      fiscal: 1,
    });
    prismaMock.permission.updateMany.mockResolvedValue({ count: 1 });
    const service = new PermissionService();

    await service.update("user-1", { fiscal: 2 }, "org-1", { actorUserId: "actor-1" });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { session_version: { increment: 1 } },
    });
    expect(prismaMock.logs.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ user_id: "actor-1" }) }),
    );
  });
});
