import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, permissionServiceMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

vi.mock("../services/PermissionService.js", () => ({
  PermissionService: vi.fn(function PermissionService() {
    return permissionServiceMock;
  }),
}));

import { UserService } from "../services/UserService.js";

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getById lança 404 quando usuário não existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const service = new UserService();

    await expect(service.getById("user-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list retorna usuários com paginação", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }]);
    prismaMock.user.count.mockResolvedValue(1);
    const service = new UserService();

    const result = await service.list({ skip: 0, take: 10 });

    expect(result).toEqual({
      users: [{ id: "user-1" }],
      total: 1,
      skip: 0,
      take: 10,
    });
  });

  it("create com organization_id cria permissão do usuário", async () => {
    bcryptMock.hash.mockResolvedValue("hashed");
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

    expect(permissionServiceMock.create).toHaveBeenCalledWith("user-1", "org-1");
    expect(permissionServiceMock.update).toHaveBeenCalledWith("user-1", { fiscal: 1 });
    expect(result).toMatchObject({ id: "user-1", permission_id: "permission-1" });
  });
});
