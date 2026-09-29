import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { updateIntegrationClient } from "../services/clientIntegrationService.js";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";
const ORGANIZATION_ID = "550e8400-e29b-41d4-a716-446655440000";

function createPrisma() {
  const findFirst = vi.fn().mockResolvedValue({ id: CLIENT_ID, type: "PJ", cpf_cnpj: "" });
  const update = vi.fn().mockResolvedValue({ id: CLIENT_ID, instagram: "@acme" });
  return {
    prisma: { client: { findFirst, update } } as unknown as PrismaClient,
    findFirst,
    update,
  };
}

describe("updateIntegrationClient Instagram binding", () => {
  it("updates the profile on the canonical client and requires Office edit permission", async () => {
    const { prisma, findFirst, update } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 2, isOwner: false },
      ),
    ).resolves.toMatchObject({ id: CLIENT_ID, instagram: "@acme" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORGANIZATION_ID },
      select: { id: true, type: true, cpf_cnpj: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CLIENT_ID }, data: { instagram: "@acme" } }),
    );
  });

  it("does not edit a client when the Office permission is below editor", async () => {
    const { prisma, findFirst, update } = createPrisma();

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 1, isOwner: false },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not edit a client outside the authenticated organization", async () => {
    const { prisma, findFirst, update } = createPrisma();
    findFirst.mockResolvedValue(null);

    await expect(
      updateIntegrationClient(
        prisma,
        CLIENT_ID,
        ORGANIZATION_ID,
        { instagram: "@acme" },
        { userId: "user-1", level: 2, isOwner: false },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(update).not.toHaveBeenCalled();
  });
});
