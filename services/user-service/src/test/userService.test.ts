import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, permissionServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
  },
  bcryptMock: {
    hash: vi.fn(),
  },
  permissionServiceMock: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMock,
}));

vi.mock("../services/permissionService.js", () => ({
  PermissionService: vi.fn(function PermissionService() {
    return permissionServiceMock;
  }),
}));

import { UserService } from "../services/userService.js";

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getById aceita usuário legado vinculado pela organização do departamento", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-legacy",
      name: "Legacy",
      login: "legacy",
      permission: 2,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: null,
      type: "admin",
      first_owner_flag: false,
      permission_id: "permission-1",
    });
    const service = new UserService();

    const result = await service.getById("user-legacy", "org-1");

    expect(result).toMatchObject({ id: "user-legacy", organization_id: "org-1" });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-legacy",
          OR: [
            { organization_id: "org-1" },
            { organization_id: null, department: { organization_id: "org-1" } },
          ],
        },
      }),
    );
  });

  it("getById lança 404 quando usuário não existe na organização", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const service = new UserService();

    await expect(service.getById("user-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          OR: [
            { organization_id: "org-1" },
            { organization_id: null, department: { organization_id: "org-1" } },
          ],
        },
      }),
    );
  });

  it("list retorna usuários da organização com paginação", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }]);
    prismaMock.user.count.mockResolvedValue(1);
    const service = new UserService();

    const result = await service.list({ skip: 0, take: 10, organizationId: "org-1" });

    expect(result).toEqual({
      users: [{ id: "user-1" }],
      total: 1,
      skip: 0,
      take: 10,
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "org-1" },
      }),
    );
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { organization_id: "org-1" },
    });
  });

  it("create com organization_id cria permissão do usuário", async () => {
    bcryptMock.hash.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      name: "Novo",
      login: "novo",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "admin",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    const result = await service.create({
      name: "Novo",
      login: "novo",
      password: "secret",
      department_id: "dep-1",
      permission: 1,
      organization_id: "org-1",
      type: "admin",
      modules: { fiscal: 1 },
    });

    expect(prismaMock.department.findFirst).toHaveBeenCalledWith({
      where: { id: "dep-1", organization_id: "org-1" },
      select: { id: true, name: true },
    });
    expect(permissionServiceMock.create).toHaveBeenCalledWith("user-1", "org-1");
    expect(permissionServiceMock.update).toHaveBeenCalledWith("user-1", { fiscal: 1 }, "org-1");
    expect(result).toMatchObject({ id: "user-1", permission_id: "permission-1" });
  });

  it("create normaliza admin departamental para permissao modular do departamento", async () => {
    bcryptMock.hash.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-contabil", name: "Contabil" });
    prismaMock.user.create.mockResolvedValue({
      id: "user-admin-contabil",
      name: "Admin Contabil",
      login: "admin.contabil",
      permission: 1,
      status: "active",
      department_id: "dep-contabil",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "admin",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    await service.create({
      name: "Admin Contabil",
      login: "admin.contabil",
      password: "secret",
      department_id: "dep-contabil",
      permission: 2,
      organization_id: "org-1",
      type: "admin",
      modules: { financeiro: 1 },
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permission: 1,
          type: "admin",
        }),
      }),
    );
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-admin-contabil",
      { financeiro: 1, contabil: 2 },
      "org-1",
    );
  });

  it("create de owner concede permissao maxima para o modulo TI", async () => {
    bcryptMock.hash.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1" });
    prismaMock.user.create.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      login: "owner",
      permission: 2,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "owner",
      first_owner_flag: true,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    await service.create({
      name: "Owner",
      login: "owner",
      password: "secret",
      department_id: "dep-1",
      permission: 2,
      organization_id: "org-1",
      type: "owner",
      first_owner_flag: true,
    });

    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ ti: 2 }),
      "org-1",
    );
  });

  it("create rejeita departamento fora da organização", async () => {
    prismaMock.department.findFirst.mockResolvedValue(null);
    const service = new UserService();

    await expect(
      service.create({
        name: "Novo",
        login: "novo",
        password: "secret",
        department_id: "dep-1",
        permission: 1,
        organization_id: "org-1",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("update só altera usuário da organização informada", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      permission_id: "permission-1",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-1", name: "Atualizado" });
    const service = new UserService();

    await service.update("user-1", { name: "Atualizado" }, "org-1");

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          OR: [
            { organization_id: "org-1" },
            { organization_id: null, department: { organization_id: "org-1" } },
          ],
        },
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it("update ao rebaixar para usuario limpa permissoes modulares antigas", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      permission_id: "permission-1",
      department_id: "dep-rh",
      type: "admin",
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Usuario",
      permission: 1,
      type: "user",
    });
    const service = new UserService();

    await service.update("user-1", { permission: 1, type: "user" }, "org-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permission: 1,
          type: "user",
        }),
      }),
    );
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        rh: null,
        ti: null,
        contabil: null,
      }),
      "org-1",
    );
  });
});
