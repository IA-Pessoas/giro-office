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
      }),
    );
  });

  it("getByUserId lança 403 quando módulo não está liberado", async () => {
    prismaMock.permission.findFirst.mockResolvedValue({
      id: "permission-1",
      user_id: "user-1",
      organization_id: "org-1",
      atendimento: null,
      certificado: null,
      comercial: null,
      contabil: null,
      financeiro: null,
      fiscal: null,
      integracao: null,
      marketing: null,
      parcelamento: null,
      pec: null,
      pessoal: null,
      regularize: null,
      rh: null,
      triagem: null,
      wiki: null,
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
});
