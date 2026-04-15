import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhCategory: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    rhRequest: {
      count: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { CategoryService } from "../services/categoryService.js";

describe("CategoryService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("create lança 409 quando nome já existe na organização", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1", name: "Financeiro" });
    const service = new CategoryService();
    await expect(service.create({ organization_id: "org-1", name: "Financeiro" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("delete lança 409 quando há solicitações vinculadas", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    prismaMock.rhRequest.count.mockResolvedValue(1);
    const service = new CategoryService();
    await expect(service.delete({ id: "cat-1", organization_id: "org-1" })).rejects.toMatchObject({ statusCode: 409 });
  });
});
