import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    department: { findMany: vi.fn() },
  },
}));

vi.mock("../prisma/index.js", () => ({
  default: prismaMock,
}));

import { PlatformUsersService } from "../services/platformUsersService.js";

describe("PlatformUsersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1", name: "Ana" }]);
    prismaMock.user.count.mockResolvedValue(21);
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
        photo_url: true,
        type: true,
      },
      skip: 0,
      take: 20,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(result).toEqual({ users: [{ id: "user-1", name: "Ana" }], total: 21, hasMore: true });
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
});
