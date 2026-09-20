import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientService } from "../services/clientService.js";

const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";

const organization = {
  id: TEST_ORG_ID,
  name: "Org Test",
  slug: "org-test",
  logo_url: null,
  status: "active",
  subscription_plan: "trial",
};

function createPrismaMock() {
  const clientCreate = vi.fn().mockResolvedValue({
    id: TEST_CLIENT_ID,
    name: "Cliente Novo",
    organization_id: TEST_ORG_ID,
    status: "Ativo",
    cpf_cnpj: "",
    company_name: null,
    fantasy_name: null,
    service_unique: false,
    deletion_date: null,
    regime: "Simples Nacional",
  });

  return {
    organization: { findUnique: vi.fn().mockResolvedValue(organization) },
    client: { create: clientCreate },
  } as unknown as PrismaClient;
}

const input = {
  name: "Cliente Novo",
  organization_id: TEST_ORG_ID,
  status: "Ativo",
  cpf_cnpj: "",
  prospecting_status: "Lead",
  type: "PJ",
  type_registration: "Novo",
  service_unique: false,
  regime: "Simples Nacional",
};

describe("ClientService.create", () => {
  it.each([
    2, 3,
  ] as const)("permite regime no nível de Integração %s e o retorna", async (level) => {
    const prisma = createPrismaMock();
    const service = new ClientService(prisma);

    const result = await service.create(input, { userId: "user-1", level, isOwner: false });

    expect(result.regime).toBe("Simples Nacional");
    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regime: "Simples Nacional" }),
        select: expect.objectContaining({ regime: true }),
      }),
    );
  });

  it.each([0, 1] as const)("rejeita regime no nível de Integração %s", async (level) => {
    const prisma = createPrismaMock();
    const service = new ClientService(prisma);

    await expect(
      service.create(input, { userId: "user-1", level, isOwner: false }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});
