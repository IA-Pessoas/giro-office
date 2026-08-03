import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

import { OperationalUserService } from "../services/operationalUserService.js";

describe("OperationalUserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list retorna colaboradores ativos da organizacao com payload minimo", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Ana Silva",
        status: "active",
        department: { name: "RH" },
      },
    ]);
    const service = new OperationalUserService();

    const result = await service.list("org-1");

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        OR: [
          { organization_id: "org-1" },
          { organization_id: null, department: { organization_id: "org-1" } },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        department: { select: { name: true } },
      },
    });
    expect(result).toEqual([
      {
        id: "user-1",
        name: "Ana Silva",
        department: "RH",
        status: "active",
      },
    ]);
  });

  it("list restringe colaboradores ao departamento informado no banco", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const service = new OperationalUserService();

    await service.list("org-1", { departmentId: "department-1" });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        department: { id: "department-1", organization_id: "org-1" },
        OR: [
          { organization_id: "org-1" },
          { organization_id: null, department: { organization_id: "org-1" } },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        department: { select: { name: true } },
      },
    });
  });

  it("list restringe colaboradores ao modulo com permissao explicita no banco", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    const service = new OperationalUserService();

    await service.list("org-1", { module: "rh" });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        permissions: {
          some: {
            organization_id: "org-1",
            rh: { gt: 0 },
          },
        },
        OR: [
          { organization_id: "org-1" },
          { organization_id: null, department: { organization_id: "org-1" } },
        ],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        department: { select: { name: true } },
      },
    });
  });
});
