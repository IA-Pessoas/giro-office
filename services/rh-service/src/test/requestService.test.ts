import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhCategory: {
      findFirst: vi.fn(),
    },
    rhRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

import { RequestService } from "../services/requestService.js";

describe("RequestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create lança 400 quando responsável é o mesmo solicitante", async () => {
    prismaMock.rhCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    const service = new RequestService();

    await expect(
      service.create({
        organization_id: "org-1",
        requester_user_id: "user-1",
        title: "Solicitação",
        description: "Descrição",
        category_id: "cat-1",
        assigned_to_user_id: "user-1",
        urgency: "High",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("getById lança 404 quando solicitação não existe", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue(null);
    const service = new RequestService();

    await expect(service.getById("req-1", "org-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list retorna solicitações filtradas por organização", async () => {
    prismaMock.rhRequest.findMany.mockResolvedValue([{ id: "req-1" }]);
    const service = new RequestService();

    const result = await service.list("org-1", { status: "New" });

    expect(result).toEqual([{ id: "req-1" }]);
  });
});
