import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ClientService } from "../services/clientService.js";

const TEST_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_CLIENT_ID = "660e8400-e29b-41d4-a716-446655440001";

describe("ClientService.listByOrganization", () => {
  it.each([
    "Ativo",
    "Inativo",
  ])("lista %s na consulta geral sem filtrar dominio_code", async (status) => {
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
        name: "Cliente sem dominio",
        organization_id: TEST_ORG_ID,
        status,
        cpf_cnpj: "123",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        deletion_date: null,
        dominio_code: null,
      },
      {
        id: `${TEST_CLIENT_ID}-empty`,
        name: "Cliente com dominio vazio",
        organization_id: TEST_ORG_ID,
        status,
        cpf_cnpj: "456",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        deletion_date: null,
        dominio_code: "",
      },
      {
        id: `${TEST_CLIENT_ID}-filled`,
        name: "Cliente com dominio preenchido",
        organization_id: TEST_ORG_ID,
        status,
        cpf_cnpj: "789",
        company_name: null,
        fantasy_name: null,
        service_unique: false,
        deletion_date: null,
        dominio_code: "DOM-1",
      },
    ]);
    const countClients = vi.fn().mockResolvedValue(3);
    const prisma = {
      organization: { findUnique: findUniqueOrg },
      client: { findMany: findManyClients, count: countClients },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    const page = await service.listByOrganization(
      TEST_ORG_ID,
      { page: 1, pageSize: 20, status },
      { userId: "user-1", level: 1, isOwner: false },
    );

    expect(page.total).toBe(3);
    expect(findManyClients).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: TEST_ORG_ID, status } }),
    );
    expect(countClients).toHaveBeenCalledWith({
      where: { organization_id: TEST_ORG_ID, status },
    });
  });

  it("permite lista generica para acesso de cliente fora da Integração", async () => {
    const prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: TEST_ORG_ID,
          name: "Org Test",
          slug: "org-test",
          logo_url: null,
          status: "active",
          subscription_plan: "trial",
        }),
      },
      client: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    await expect(
      service.listByOrganization(
        TEST_ORG_ID,
        { page: 1, pageSize: 20 },
        {
          userId: "user-1",
          level: 0,
          isOwner: false,
          hasClientListAccess: true,
        },
      ),
    ).resolves.toMatchObject({ items: [], total: 0 });
  });

  it("executa consultas em sequencia para evitar esgotar o pool de sessoes", async () => {
    let activeQueries = 0;
    let maxActiveQueries = 0;
    async function trackQuery<T>(result: T): Promise<T> {
      activeQueries += 1;
      maxActiveQueries = Math.max(maxActiveQueries, activeQueries);
      await Promise.resolve();
      activeQueries -= 1;

      return result;
    }
    const prisma = {
      organization: {
        findUnique: vi.fn(() =>
          trackQuery({
            id: TEST_ORG_ID,
            name: "Org Test",
            slug: "org-test",
            logo_url: null,
            status: "active",
            subscription_plan: "trial",
          }),
        ),
      },
      client: {
        findMany: vi.fn(() =>
          trackQuery([
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
          ]),
        ),
        count: vi.fn(() => trackQuery(1)),
      },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    await service.listByOrganization(
      TEST_ORG_ID,
      {
        page: 1,
        pageSize: 10,
      },
      { userId: "user-1", level: 1, isOwner: false },
    );

    expect(maxActiveQueries).toBe(1);
  });

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

    const page = await service.listByOrganization(
      TEST_ORG_ID,
      {
        page: 1,
        pageSize: 20,
      },
      { userId: "user-1", level: 1, isOwner: false },
    );

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

describe("ClientService.getById", () => {
  it("returns Regularize detail fields without changing list select", async () => {
    const findUniqueOrg = vi.fn().mockResolvedValue({
      id: TEST_ORG_ID,
      name: "Org Test",
      slug: "org-test",
      logo_url: null,
      status: "active",
      subscription_plan: "trial",
    });
    const findFirstClient = vi.fn().mockResolvedValue({
      id: TEST_CLIENT_ID,
      name: "Cliente A",
      organization_id: TEST_ORG_ID,
      status: "Ativo",
      cpf_cnpj: "123",
      company_name: "Cliente A LTDA",
      fantasy_name: "Cliente A",
      service_unique: false,
      deletion_date: null,
      dominio_code: "DOM-1",
      responsible: "Maria",
      cpf_responsible: "12345678910",
      address: "Rua 1",
      cep: "01001000",
      neighborhood: "Centro",
      state: "SP",
      city: "Sao Paulo",
      customer_since: new Date("2026-01-02T00:00:00.000Z"),
      municipal_registration: "IM-1",
      state_registration: "IE-1",
      commercial_board_registration: "JUCESP-1",
      competence_entry: new Date("2025-12-01T00:00:00.000Z"),
      competence_output: null,
      opening_date: new Date("2025-05-04T00:00:00.000Z"),
      instagram: "@clientea",
      indication: "Indicacao",
      regime: "Simples Nacional",
      size: "EPP",
      segment: "Contabilidade",
      cnae: "6920-6/01",
      cnae_secondary: "6201-5/01",
      agent: "Joao",
      cpf_agent: "10987654321",
      number: "123",
      email: "cliente@example.com",
      contabil: true,
      fiscal: true,
      pessoal: false,
      infoproduto: false,
      consultoria: true,
      castelo_med: false,
      contract: true,
      date_status: new Date("2026-02-03T00:00:00.000Z"),
      description_prospecting: "Contato inicial",
      participants_meet: "3",
      meet_type: "Online",
      register_date_prospecting: new Date("2026-02-04T00:00:00.000Z"),
      start_strike: null,
      end_strike: null,
    });
    const prisma = {
      organization: { findUnique: findUniqueOrg },
      client: { findFirst: findFirstClient },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    const client = await service.getById(TEST_CLIENT_ID, TEST_ORG_ID, {
      userId: "user-1",
      level: 1,
      isOwner: false,
    });

    expect(client).toMatchObject({
      id: TEST_CLIENT_ID,
      responsible: "Maria",
      cpf_responsible: "12345678910",
      address: "Rua 1",
      customer_since: "2026-01-02T00:00:00.000Z",
      competence_entry: "2025-12-01T00:00:00.000Z",
      competence_output: null,
      opening_date: "2025-05-04T00:00:00.000Z",
      instagram: "@clientea",
      indication: "Indicacao",
      regime: "Simples Nacional",
      size: "EPP",
      segment: "Contabilidade",
      agent: "Joao",
      cpf_agent: "10987654321",
      number: "123",
      email: "cliente@example.com",
      contabil: true,
      fiscal: true,
      pessoal: false,
      infoproduto: false,
      consultoria: true,
      castelo_med: false,
      contract: true,
      date_status: "2026-02-03T00:00:00.000Z",
      description_prospecting: "Contato inicial",
      participants_meet: "3",
      meet_type: "Online",
      register_date_prospecting: "2026-02-04T00:00:00.000Z",
    });
    expect(findFirstClient).toHaveBeenCalledWith({
      where: { id: TEST_CLIENT_ID, organization_id: TEST_ORG_ID },
      select: expect.objectContaining({
        id: true,
        responsible: true,
        cpf_responsible: true,
        address: true,
        customer_since: true,
        competence_entry: true,
        competence_output: true,
        opening_date: true,
        contabil: true,
        fiscal: true,
        pessoal: true,
        infoproduto: true,
        castelo_med: true,
        contract: true,
        date_status: true,
        participants_meet: true,
      }),
    });
  });

  it("bloqueia criação no nível 1 antes de consultar a organização", async () => {
    const findUniqueOrg = vi.fn();
    const prisma = {
      organization: { findUnique: findUniqueOrg },
      client: { create: vi.fn() },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    await expect(
      service.create(
        {
          name: "Cliente",
          organization_id: TEST_ORG_ID,
          status: "Ativo",
          cpf_cnpj: "",
          prospecting_status: "Lead",
          type: "PJ",
          type_registration: "Novo",
          service_unique: false,
        },
        { userId: "user-1", level: 1, isOwner: false },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findUniqueOrg).not.toHaveBeenCalled();
  });

  it("impede nível 2 de inativar cliente pelo PATCH", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: TEST_CLIENT_ID });
    const update = vi.fn();
    const prisma = {
      client: { findFirst, update },
    } as unknown as PrismaClient;
    const service = new ClientService(prisma);

    await expect(
      service.update(
        TEST_CLIENT_ID,
        TEST_ORG_ID,
        { status: "Inativo" },
        { userId: "user-1", level: 2, isOwner: false },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(update).not.toHaveBeenCalled();
  });
});
