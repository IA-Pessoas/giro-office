import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientPfService } from "./clientPfService.js";

describe("ClientPfService", () => {
  it("filters before paginating and returns PF list metadata scoped to the organization", async () => {
    const prisma = {
      clientPF: {
        findMany: vi.fn(async () => [{ id: "pf-1", code: "001", name: "Ana", cpf: "12345678901" }]),
        count: vi.fn(async () => 3),
      },
    } as unknown as PrismaClient;
    const service = new ClientPfService(prisma, {} as never);

    const result = await service.list({
      organizationId: "org-1",
      status: "Ativo",
      search: "ana",
      page: 1,
      limit: 2,
    });

    const where = {
      organization_id: "org-1",
      status: "Ativo",
      OR: [
        { name: { contains: "ana", mode: "insensitive" } },
        { code: { contains: "ana", mode: "insensitive" } },
        { cpf: { contains: "ana", mode: "insensitive" } },
      ],
    };

    expect(result).toMatchObject({ total: 3, page: 1, limit: 2, hasMore: true });
    expect(prisma.clientPF.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 0, take: 2 }),
    );
    expect(prisma.clientPF.count).toHaveBeenCalledWith({ where });
  });
});
