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
    cpf_cnpj: "12345678000195",
    company_name: null,
    fantasy_name: null,
    service_unique: false,
    deletion_date: null,
    regime: "Simples Nacional",
  });

  return {
    organization: { findUnique: vi.fn().mockResolvedValue(organization) },
    client: { create: clientCreate, findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
}

const input = {
  name: "Cliente Novo",
  organization_id: TEST_ORG_ID,
  status: "Ativo",
  cpf_cnpj: "12345678000195",
  prospecting_status: "Lead",
  type: "PJ",
  type_registration: "Novo",
  service_unique: false,
  regime: "Simples Nacional",
};

describe("ClientService.create", () => {
  it("rejeita CPF inválido antes de persistir", async () => {
    const prisma = createPrismaMock();
    const service = new ClientService(prisma);

    await expect(
      service.create(
        { ...input, type: "PF", cpf_cnpj: "52998224726" },
        {
          userId: "user-1",
          level: 2,
          isOwner: false,
        },
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: "CPF inválido." });

    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it("rejeita documento duplicado na organização", async () => {
    const prisma = createPrismaMock();
    vi.mocked(prisma.client.findFirst).mockResolvedValueOnce({ id: TEST_CLIENT_ID } as never);
    const service = new ClientService(prisma);

    await expect(
      service.create(input, { userId: "user-1", level: 2, isOwner: false }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.client.create).not.toHaveBeenCalled();
  });

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

  it("persists optional client address fields while preserving contact and identity", async () => {
    const prisma = createPrismaMock();
    const service = new ClientService(prisma);
    const contact = {
      number: "11999999999",
      email: "contato@acme.com",
      address: "Rua A, 10",
      cep: "01001-000",
      neighborhood: "Centro",
      state: "SP",
      city: "São Paulo",
    };

    await service.create(
      { ...input, cpf_cnpj: "12.345.678/0001-95", ...contact },
      { userId: "user-1", level: 2, isOwner: false },
    );

    expect(prisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpf_cnpj: "12345678000195",
          ...contact,
        }),
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
