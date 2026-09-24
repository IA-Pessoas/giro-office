import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    platformUser: { findMany: vi.fn() },
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    department: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
const { managementMock } = vi.hoisted(() => ({
  managementMock: { create: vi.fn(), getPermissions: vi.fn(), updatePermissions: vi.fn() },
}));

const { userServiceMock } = vi.hoisted(() => ({
  userServiceMock: {
    delete: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));
vi.mock("../services/userManagementService.js", () => ({
  PlatformUserManagementAdapter: vi.fn(function PlatformUserManagementAdapter() {
    return managementMock;
  }),
}));
vi.mock("../services/userService.js", () => ({
  UserManagementService: vi.fn(),
  UserService: vi.fn(function UserService() {
    return userServiceMock;
  }),
}));

import { PlatformUsersService } from "../services/platformUsersService.js";

describe("PlatformUsersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.platformUser.findMany.mockResolvedValue([
      {
        id: "platform-user-1",
        name: "Platform Administrator",
        email: "admin@example.com",
        status: "active",
        can_impersonate: true,
      },
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1", name: "Ana" }]);
    prismaMock.user.count.mockResolvedValue(21);
    managementMock.create.mockReset();
    managementMock.getPermissions.mockResolvedValue({ rh: 2, fiscal: 1 });
    managementMock.updatePermissions.mockResolvedValue({ rh: 3, fiscal: 1 });
  });

  it("lists only safe fields from platform super admins", async () => {
    const service = new PlatformUsersService();

    await expect(service.listSuperAdmins()).resolves.toEqual([
      {
        id: "platform-user-1",
        name: "Platform Administrator",
        email: "admin@example.com",
        status: "active",
        can_impersonate: true,
      },
    ]);
    expect(prismaMock.platformUser.findMany).toHaveBeenCalledWith({
      where: { platform_role: "super_admin" },
      select: { id: true, name: true, email: true, status: true, can_impersonate: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  });

  it("filters every query by organization", async () => {
    const service = new PlatformUsersService();

    const result = await service.list({
      organizationId: "org-1",
      skip: 0,
      take: 20,
      search: "ana",
    });

    const expectedWhere = {
      organization_id: "org-1",
      OR: [
        { name: { contains: "ana", mode: "insensitive" } },
        { login: { contains: "ana", mode: "insensitive" } },
      ],
    };
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      select: {
        id: true,
        name: true,
        login: true,
        status: true,
        department_id: true,
        permission: true,
        photo_url: true,
        type: true,
        version: true,
      },
      skip: 0,
      take: 20,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({ users: [{ id: "user-1", name: "Ana" }], total: 21, hasMore: true });
  });

  it("cria no tenant do path e projeta a resposta sem credenciais", async () => {
    managementMock.create.mockResolvedValue({
      id: "user-1",
      name: "Ana",
      login: "ana",
      status: "active",
      department_id: "dep-1",
      permission: 1,
      photo_url: null,
      type: "admin",
      version: 1,
    });
    const service = new PlatformUsersService();

    await expect(
      service.create(
        "org-path",
        {
          name: "Ana",
          login: "ana",
          password: "segredo",
          department_id: "dep-1",
          permission: 1,
          organization_id: "org-forjada",
        },
        "platform-1",
      ),
    ).resolves.toEqual({
      id: "user-1",
      name: "Ana",
      login: "ana",
      status: "active",
      department_id: "dep-1",
      permission: 1,
      photo_url: null,
      type: "admin",
      version: 1,
    });
    expect(managementMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-path" }),
    );
  });

  it("caps the page size at 100", async () => {
    const service = new PlatformUsersService();

    await service.list({ organizationId: "org-1", skip: 100, take: 500, search: "" });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "org-1" },
        skip: 100,
        take: 100,
      }),
    );
  });

  it("reads a user and departments through the selected organization only", async () => {
    const service = new PlatformUsersService();
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-1", name: "Ana" });
    prismaMock.department.findMany.mockResolvedValue([{ id: "dep-1", name: "Fiscal" }]);

    await expect(service.getById("org-1", "user-1")).resolves.toEqual({
      id: "user-1",
      name: "Ana",
    });
    await expect(service.listDepartments("org-1")).resolves.toEqual([
      { id: "dep-1", name: "Fiscal" },
    ]);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1", organization_id: "org-1" } }),
    );
    expect(prismaMock.department.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("delegates modular permission reads and writes through the platform adapter scoped to the tenant", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = new PlatformUsersService(audit);

    await expect(service.getPermissions("org-1", "user-1", "platform-user-1")).resolves.toEqual({
      rh: 2,
      fiscal: 1,
    });
    await expect(
      service.updatePermissions("org-1", "user-1", { rh: 3 }, "platform-user-1"),
    ).resolves.toEqual({ rh: 3, fiscal: 1 });

    expect(managementMock.getPermissions).toHaveBeenCalledWith("user-1");
    expect(managementMock.updatePermissions).toHaveBeenCalledWith("user-1", { rh: 3 });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        platformActorUserId: "platform-user-1",
        action: "platform.user.permissions.updated",
        referring: "user",
        referringId: "user-1",
        changes: { modules: { before: { rh: 2, fiscal: 1 }, after: { rh: 3, fiscal: 1 } } },
      }),
    );
    expect(audit.mock.calls[0][0]).not.toHaveProperty("actorUserId");
  });

  it("delegates deactivation and reactivation to the transactional user lifecycle in the selected organization", async () => {
    const service = new PlatformUsersService();
    const reactivated = {
      id: "user-1",
      name: "Ana",
      login: "ana",
      status: "active",
      department_id: "department-1",
      photo_url: null,
      type: "user",
    };
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Ana",
      status: "active",
    });
    userServiceMock.update.mockResolvedValue(reactivated);

    await service.deactivate("org-1", "user-1");
    await expect(service.reactivate("org-1", "user-1")).resolves.toEqual(reactivated);

    expect(userServiceMock.delete).toHaveBeenCalledWith("user-1", "org-1");
    expect(userServiceMock.update).toHaveBeenCalledWith(
      "user-1",
      { status: "active" },
      "org-1",
      undefined,
      "REACTIVATE",
    );
  });

  it("transfers ownership atomically and invalidates both affected user sessions", async () => {
    const transaction = {
      user: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.user.findFirst
      .mockResolvedValueOnce({
        id: "owner-1",
        name: "Current owner",
        login: "owner",
        status: "active",
        type: "owner",
        permission: 2,
        version: 3,
      })
      .mockResolvedValueOnce({
        id: "successor-1",
        name: "Successor",
        login: "successor",
        status: "active",
        type: "admin",
        permission: 1,
        version: 5,
      });
    transaction.user.updateMany.mockResolvedValue({ count: 1 });
    transaction.user.count.mockResolvedValue(1);

    const service = new PlatformUsersService();

    await expect(
      service.transferOwnership("org-1", {
        currentOwnerId: "owner-1",
        successorUserId: "successor-1",
        previousOwnerAction: "deactivate",
        justification: "Recuperação administrativa aprovada.",
      }),
    ).resolves.toEqual({
      currentOwner: expect.objectContaining({
        id: "owner-1",
        status: "inactive",
        type: "admin",
        permission: 1,
        version: 4,
      }),
      successor: expect.objectContaining({
        id: "successor-1",
        status: "active",
        type: "owner",
        permission: 2,
        version: 6,
      }),
    });

    expect(transaction.user.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "successor-1", organization_id: "org-1" }),
        data: expect.objectContaining({ type: "owner", session_version: { increment: 1 } }),
      }),
    );
    expect(transaction.user.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: "owner-1", organization_id: "org-1" }),
        data: expect.objectContaining({
          status: "inactive",
          type: "admin",
          session_version: { increment: 1 },
        }),
      }),
    );
  });

  it("rolls back when either ownership update loses its optimistic concurrency check", async () => {
    const transaction = {
      user: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.user.findFirst
      .mockResolvedValueOnce({ id: "owner-1", status: "active", type: "owner", version: 1 })
      .mockResolvedValueOnce({ id: "successor-1", status: "active", type: "user", version: 1 });
    transaction.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      new PlatformUsersService().transferOwnership("org-1", {
        currentOwnerId: "owner-1",
        successorUserId: "successor-1",
        previousOwnerAction: "demote",
        justification: "Correção aprovada.",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.user.count).not.toHaveBeenCalled();
  });

  it("rejects a successor outside the organization before changing either user", async () => {
    const transaction = {
      user: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback) => callback(transaction));
    transaction.user.findFirst
      .mockResolvedValueOnce({ id: "owner-1", status: "active", type: "owner", version: 1 })
      .mockResolvedValueOnce(null);

    await expect(
      new PlatformUsersService().transferOwnership("org-1", {
        currentOwnerId: "owner-1",
        successorUserId: "foreign-user",
        previousOwnerAction: "demote",
        justification: "Correção aprovada.",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(transaction.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "foreign-user", organization_id: "org-1" },
      }),
    );
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
});
