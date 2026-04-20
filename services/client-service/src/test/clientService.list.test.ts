import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientService } from "../services/clientService.js";

const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("ClientService.listByOrganization", () => {
  it("monta a organizacao fora do select de client", async () => {
    const findUniqueOrg = vi.fn().mockResolvedValue({
      id: TEST_ORG_ID,
      name: "Org Test",
      slug: "org-test",
      logo_url: null,
      status: "active",
      subscription_plan: "trial",
    });
    const findManyClients = vi.fn().mockResolvedValue([
      {
        id: TEST_CLIENT_ID,
        name: "Cliente A",
        organization_id: TEST_ORG_ID,
        status: "Ativo",
        cpf_cnpj: "123",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        deletion_date: null,
      },
    ]);
    const countClients = vi.fn().mockResolvedValue(1);
    const prisma = {
      organization: { findUnique: findUniqueOrg },
      client: {
        findMany: findManyClients,
        count: countClients,
      },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    const page = await service.listByOrganization(TEST_ORG_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(page).toEqual({
      items: [
        {
          id: TEST_CLIENT_ID,
          name: "Cliente A",
          organization_id: TEST_ORG_ID,
          status: "Ativo",
          cpf_cnpj: "123",
          company_name: null,
          fantasy_name: null,
          service_unique: false,
          deletion_date: null,
          organization: {
            id: TEST_ORG_ID,
            name: "Org Test",
            slug: "org-test",
            logo_url: null,
            status: "active",
            subscription_plan: "trial",
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    expect(findUniqueOrg).toHaveBeenCalledWith({
      where: { id: TEST_ORG_ID },
      select: {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        status: true,
        subscription_plan: true,
      },
    });
    expect(findManyClients).toHaveBeenCalledWith({
      where: { organization_id: TEST_ORG_ID },
      orderBy: { name: "asc" },
      skip: 0,
      take: 20,
      select: {
        id: true,
        name: true,
        organization_id: true,
        status: true,
        cpf_cnpj: true,
        company_name: true,
        fantasy_name: true,
        service_unique: true,
        deletion_date: true,
      },
    });
    expect(countClients).toHaveBeenCalledWith({
      where: { organization_id: TEST_ORG_ID },
    });
  });
});
