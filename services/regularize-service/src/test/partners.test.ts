import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createPartnerBodySchema, updatePartnerBodySchema } from "../schemas/partners.schemas.js";
import type { RegularizeReconciliationService } from "../services/regularizeReconciliationService.js";
import { PartnersService } from "../services/partnersService.js";

const PJ_ID = "10000000-0000-4000-8000-000000000001";
const PF_ID = "10000000-0000-4000-8000-000000000002";
const PARTNER_ID = "10000000-0000-4000-8000-000000000003";
const ORG_ID = "10000000-0000-4000-8000-000000000004";

const body = { pj_id: PJ_ID, pf_id: PF_ID, part: 50, entry: "2024-01-15" };

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

describe("partner body schema", () => {
  it.each([0, -5, 150])("rejects participation %s outside (0, 100]", (part) => {
    const result = createPartnerBodySchema.safeParse({ ...body, part });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Participação deve ser maior que 0% e no máximo 100%.");
  });

  it("rejects exit before entry on create and update", () => {
    const exit = { ...body, exit: "2020-01-15" };
    for (const result of [
      createPartnerBodySchema.safeParse(exit),
      updatePartnerBodySchema.safeParse({ ...exit, id: PARTNER_ID }),
    ]) {
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe("Data de saída não pode ser anterior à entrada.");
    }
  });

  it("rejects incomplete dates with a field message", () => {
    const result = createPartnerBodySchema.safeParse({ ...body, entry: "2024-01" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("Informe a data de entrada completa (dd/mm/aaaa).");
  });

  it("accepts 100% and exit on the entry day", () => {
    expect(
      createPartnerBodySchema.safeParse({ ...body, part: 100, exit: "2024-01-15" }).success,
    ).toBe(true);
  });
});

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

  it("reports an existing link with an accented message", async () => {
    const { partners } = service([], true);

    await expect(partners.create(input(10))).rejects.toMatchObject({
      statusCode: 409,
      message: "Sócio já cadastrado.",
    });
  });
});
