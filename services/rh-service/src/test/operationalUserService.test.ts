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
});
