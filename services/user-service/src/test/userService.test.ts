import { ServiceError } from "@workspace/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, passwordHashMock, permissionServiceMock, userAuditMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
  },
  passwordHashMock: {
    hashPassword: vi.fn(),
  },
  permissionServiceMock: {
    create: vi.fn(),
    getByUserId: vi.fn(),
    update: vi.fn(),
  },
  userAuditMock: vi.fn(),
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

vi.mock("../security/passwordHashService.js", () => ({
  hashPassword: passwordHashMock.hashPassword,
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
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
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

  it("getByIdWithModules retorna somente a permissão modular da organização", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Usuário",
      login: "user",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: "permission-1",
    });
    permissionServiceMock.getByUserId.mockResolvedValue({
      user_id: "user-1",
      organization_id: "org-1",
      contabil: 1,
      rh: 1,
      ti: 1,
      fiscal: null,
    });
    const service = new UserService();

    const result = await service.getByIdWithModules("user-1", "org-1");

    expect(result.modules).toMatchObject({ contabil: 1, rh: 1, ti: 1, fiscal: 0 });
    expect(result.modules).not.toHaveProperty("atendimento");
    expect(permissionServiceMock.getByUserId).toHaveBeenCalledWith("user-1", undefined, "org-1");
  });

  it("getByIdWithModules assume nível zero quando a permissão não existe", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Usuário",
      login: "user",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.getByUserId.mockRejectedValue(
      new ServiceError(404, "Permissão não encontrada."),
    );
    const service = new UserService();

    const result = await service.getByIdWithModules("user-1", "org-1");

    expect(Object.values(result.modules).every((level) => level === 0)).toBe(true);
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
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
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
      modules: { atendimento: 2, fiscal: 1, pec: 2, wiki: 1 },
    });

    expect(prismaMock.department.findFirst).toHaveBeenCalledWith({
      where: { id: "dep-1", organization_id: "org-1" },
      select: { id: true, name: true },
    });
    expect(permissionServiceMock.create).toHaveBeenCalledWith("user-1", "org-1");
    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-1",
      { fiscal: 1, rh: 1, ti: 1 },
      "org-1",
    );
    expect(passwordHashMock.hashPassword).toHaveBeenCalledWith("secret");
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ password: "hashed" }) }),
    );
    expect(result).toMatchObject({ id: "user-1", permission_id: "permission-1" });
  });

  it("create concede RH e TI self-service para usuario elegivel", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-fiscal", name: "Fiscal" });
    prismaMock.user.create.mockResolvedValue({
      id: "user-self-service",
      name: "Usuario",
      login: "usuario",
      permission: 1,
      status: "active",
      department_id: "dep-fiscal",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    await service.create({
      name: "Usuario",
      login: "usuario",
      password: "secret",
      department_id: "dep-fiscal",
      permission: 1,
      organization_id: "org-1",
      type: "user",
    });

    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-self-service",
      { rh: 1, ti: 1 },
      "org-1",
    );
  });

  it("create preserva RH e TI gestao explicitos para usuario elegivel", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-fiscal", name: "Fiscal" });
    prismaMock.user.create.mockResolvedValue({
      id: "user-management",
      name: "Gestor",
      login: "gestor",
      permission: 1,
      status: "active",
      department_id: "dep-fiscal",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    await service.create({
      name: "Gestor",
      login: "gestor",
      password: "secret",
      department_id: "dep-fiscal",
      permission: 1,
      organization_id: "org-1",
      type: "user",
      modules: { rh: 2, ti: 2 },
    });

    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-management",
      { rh: 2, ti: 2 },
      "org-1",
    );
  });

  it("create nao concede RH ou TI automaticamente para visualizador", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-fiscal", name: "Fiscal" });
    prismaMock.user.create.mockResolvedValue({
      id: "viewer-1",
      name: "Viewer",
      login: "viewer",
      permission: 0,
      status: "active",
      department_id: "dep-fiscal",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService();

    await service.create({
      name: "Viewer",
      login: "viewer",
      password: "secret",
      department_id: "dep-fiscal",
      permission: 0,
      organization_id: "org-1",
      type: "user",
    });

    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });

  it("create normaliza admin departamental para permissao modular do departamento", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
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
      { financeiro: 1, contabil: 3, rh: 1, ti: 1 },
      "org-1",
    );
  });

  it("create de owner concede permissao maxima para o modulo TI", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed");
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
      expect.objectContaining({ ti: 3, rh: 3, certificado: 3 }),
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
    expect(prismaMock.user.updateMany).toHaveBeenCalled();
  });

  it("update compara a versão esperada e a incrementa na mesma escrita", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Antes",
      login: "antes",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: "permission-1",
      version: 7,
    });

    const result = await new UserService().update(
      "user-1",
      { name: "Depois", expected_version: 7 },
      "org-1",
    );

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", version: 7 },
      data: { name: "Depois", version: { increment: 1 } },
    });
    expect(result).toMatchObject({ id: "user-1", name: "Depois", version: 8 });
  });

  it("update rejeita edição concorrente sem sobrescrever o usuário", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      permission_id: "permission-1",
      department_id: "dep-1",
      permission: 1,
      type: "user",
      version: 8,
    });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      new UserService().update("user-1", { name: "Depois", expected_version: 7 }, "org-1"),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1", version: 7 } }),
    );
    expect(permissionServiceMock.update).not.toHaveBeenCalled();
  });

  it("update armazena uma nova senha usando o hash atual", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      permission: 1,
      department_id: "dep-1",
      type: "user",
    });
    passwordHashMock.hashPassword.mockResolvedValue("$argon2id$v=19$updated");

    await new UserService().update("user-1", { password: "nova-senha" }, "org-1");

    expect(passwordHashMock.hashPassword).toHaveBeenCalledWith("nova-senha");
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: "$argon2id$v=19$updated",
          version: { increment: 1 },
        }),
      }),
    );
  });

  it("update records a safe administrative audit with actor and diff", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Before",
      login: "before",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: "permission-1",
    });
    const service = new UserService(userAuditMock);

    await service.update("user-1", { name: "After" }, "org-1", "actor-1");

    expect(userAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "actor-1",
        organizationId: "org-1",
        action: "UPDATE",
        referring: "user",
        referringId: "user-1",
        outcome: "success",
        changes: {
          name: { previous: "Before", next: "After" },
        },
      }),
    );
    expect(userAuditMock.mock.calls[0]?.[0].changes).not.toHaveProperty("password");
  });

  it("create records the new user without credentials", async () => {
    passwordHashMock.hashPassword.mockResolvedValue("hashed-password");
    prismaMock.department.findFirst.mockResolvedValue({ id: "dep-1", name: "Fiscal" });
    prismaMock.user.create.mockResolvedValue({
      id: "user-created",
      name: "Created",
      login: "created",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      joined_at: new Date("2025-01-01"),
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      permission_id: null,
    });
    permissionServiceMock.create.mockResolvedValue({ id: "permission-1" });
    const service = new UserService(userAuditMock);

    await service.create(
      {
        name: "Created",
        login: "created",
        password: "secret",
        department_id: "dep-1",
        permission: 1,
        organization_id: "org-1",
        type: "user",
      },
      "actor-1",
    );

    expect(userAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        referring: "user",
        referringId: "user-created",
        actorUserId: "actor-1",
        organizationId: "org-1",
        outcome: "success",
        changes: expect.not.objectContaining({ password: expect.anything() }),
      }),
    );
  });

  it("delete records the deactivation after success", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "User",
      login: "user",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
    });
    prismaMock.user.update.mockResolvedValue({});
    const service = new UserService(userAuditMock);

    await service.delete("user-1", "org-1", "actor-1");

    expect(userAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DEACTIVATE",
        referring: "user",
        referringId: "user-1",
        actorUserId: "actor-1",
        organizationId: "org-1",
        outcome: "success",
      }),
    );
  });

  it("delete rejeita desativação concorrente sem convertê-la em erro interno", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "User",
      login: "user",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
      version: 3,
    });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(new UserService().delete("user-1", "org-1")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("update photo uses the dedicated audit action", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "User",
      login: "user",
      permission: 1,
      status: "active",
      department_id: "dep-1",
      photo_url: null,
      organization_id: "org-1",
      type: "user",
      first_owner_flag: false,
    });
    const service = new UserService(userAuditMock);

    await service.update("user-1", { photo_url: "photo-url" }, "org-1", "actor-1", "UPDATE_PHOTO");

    expect(userAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE_PHOTO", referringId: "user-1" }),
    );
  });

  it("update ao rebaixar para usuario limpa permissoes modulares antigas e mantem RH self-service", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      permission_id: "permission-1",
      department_id: "dep-rh",
      type: "admin",
    });
    const service = new UserService();

    await service.update("user-1", { permission: 1, type: "user" }, "org-1");

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
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
        rh: 1,
        ti: 1,
        contabil: 0,
      }),
      "org-1",
    );
  });

  it("update concede RH e TI self-service para usuario elegivel sem modules explicito", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-viewer",
      permission_id: "permission-1",
      department_id: "dep-fiscal",
      permission: 0,
      type: "user",
    });
    const service = new UserService();

    await service.update("user-viewer", { permission: 1 }, "org-1");

    expect(permissionServiceMock.update).toHaveBeenCalledWith(
      "user-viewer",
      expect.objectContaining({
        rh: 1,
        ti: 1,
      }),
      "org-1",
    );
  });
});
