import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createPartnerBodySchema } from "../schemas/partners.schemas.js";
import { PartnersService } from "../services/partnersService.js";
import type { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";

const PJ_ID = "10000000-0000-4000-8000-000000000001";
const PF_ID = "10000000-0000-4000-8000-000000000002";
const PARTNER_ID = "10000000-0000-4000-8000-000000000003";
const ORG_ID = "10000000-0000-4000-8000-000000000004";

const body = { pj_id: PJ_ID, pf_id: PF_ID, part: 50, entry: "2024-01-15" };

function service(existingParts: number[], duplicate = false) {
  const prisma = {
    clientPF: { findFirst: vi.fn().mockResolvedValue({ id: PF_ID }) },
    client: { findFirst: vi.fn().mockResolvedValue({ id: PJ_ID }) },
    partners: {
      findFirst: vi.fn().mockResolvedValue(duplicate ? { id: PARTNER_ID } : null),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { part: existingParts.reduce((sum, part) => sum + part, 0) },
      }),
      create: vi.fn().mockResolvedValue({ id: PARTNER_ID, pf_id: PF_ID }),
    },
    logs: { create: vi.fn() },
  } as unknown as PrismaClient;
  const reconciliation = {
    handlePartnersChanged: vi.fn(),
  } as unknown as RegularizeReconciliationService;
  return { prisma, partners: new PartnersService(prisma, reconciliation) };
}

describe("PartnersService.create", () => {
  const input = (part: number) => ({
    organizationId: ORG_ID,
    userId: "user-1",
    body: createPartnerBodySchema.parse({ ...body, part }),
  });

  it("rejects when the PJ participation would exceed 100%", async () => {
    const { prisma, partners } = service([60, 30]);

    await expect(partners.create(input(20))).rejects.toMatchObject({
      statusCode: 400,
      message: "A soma das participações da empresa passaria de 100% (atual: 90%).",
    });
    expect(prisma.partners.create).not.toHaveBeenCalled();
  });

  it("accepts when the PJ participation reaches exactly 100%", async () => {
    const { prisma, partners } = service([60, 30]);

    await partners.create(input(10));

    expect(prisma.partners.create).toHaveBeenCalled();
  });

  it("counts only current partners (no exit or exit from today on) in the PJ sum", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));
    try {
      const { prisma, partners } = service([]);

      await partners.create(input(10));

      expect(prisma.partners.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ exit: null }, { exit: { gte: new Date("2026-09-24T00:00:00.000Z") } }],
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports an existing link with an accented message", async () => {
    const { partners } = service([], true);

    await expect(partners.create(input(10))).rejects.toMatchObject({
      statusCode: 409,
      message: "Sócio já cadastrado.",
    });
  });
});

describe("PartnersService.update", () => {
  it("rejects moving a link onto a PF already linked to the PJ", async () => {
    const otherPf = "10000000-0000-4000-8000-000000000009";
    const prisma = {
      clientPF: { findFirst: vi.fn().mockResolvedValue({ id: otherPf }) },
      client: { findFirst: vi.fn().mockResolvedValue({ id: PJ_ID }) },
      partners: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: PARTNER_ID, pj_id: PJ_ID, pf_id: PF_ID, part: 50 })
          .mockResolvedValueOnce({ id: "another-link" }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { part: 0 } }),
        update: vi.fn(),
      },
    } as unknown as PrismaClient;
    const partners = new PartnersService(prisma, {
      handlePartnersChanged: vi.fn(),
    } as unknown as RegularizeReconciliationService);

    await expect(
      partners.update({
        organizationId: ORG_ID,
        userId: "user-1",
        body: { ...createPartnerBodySchema.parse({ ...body, pf_id: otherPf }), id: PARTNER_ID },
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: "Sócio já cadastrado." });
    expect(prisma.partners.update).not.toHaveBeenCalled();
  });
});
