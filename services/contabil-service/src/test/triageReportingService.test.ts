import "./envBootstrap.js";

import { TRIAGE_ACCOUNTING_CHECKLIST_FIELDS } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { InternalReportingService } from "../services/internalReportingService.js";
import {
  competencesBetween,
  extractTriageReportingPage,
} from "../services/triageReportingService.js";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ANA = "11111111-1111-4111-8111-111111111111";
const USER_BRUNO = "22222222-2222-4222-8222-222222222222";

const clientRows = [
  {
    id: CLIENT_A,
    name: "Alfa",
    company_name: "Alfa Comércio Ltda",
    cpf_cnpj: "11222333000181",
    status: "Ativo",
    competence_entry: new Date("2024-03-01T00:00:00.000Z"),
    contabil: true,
    fiscal: null,
  },
  {
    id: CLIENT_B,
    name: "Beta",
    company_name: null,
    cpf_cnpj: "52998224725",
    status: "Inativo",
    competence_entry: null,
    contabil: false,
    fiscal: true,
  },
];

function delegates(monthly: readonly Record<string, unknown>[] = []) {
  return {
    clients: { findMany: vi.fn().mockResolvedValue(clientRows) },
    clouds: {
      findMany: vi.fn().mockResolvedValue([
        { client_id: CLIENT_A, type: "Drive", link: "https://drive.test/a" },
        { client_id: CLIENT_A, type: "OneDrive", link: "https://one.test/a" },
      ]),
    },
    monthly: { findMany: vi.fn().mockResolvedValue(monthly) },
    responsibles: {
      findMany: vi.fn().mockResolvedValue([{ client_id: CLIENT_A, customer_with_movement: true }]),
    },
    assignments: { findMany: vi.fn().mockResolvedValue([]) },
    competences: { findMany: vi.fn().mockResolvedValue([]) },
    users: {
      findMany: vi.fn().mockResolvedValue([
        { id: USER_ANA, name: "Ana Souza" },
        { id: USER_BRUNO, name: "Bruno Lima" },
      ]),
    },
  };
}

describe("extractTriageReportingPage", () => {
  it("lista cada cliente da organização com Clouds, serviços e movimento, mesmo sem Cloud", async () => {
    const prisma = delegates();

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_clouds",
        organizationId: ORG,
        fields: [
          "company_name",
          "name",
          "cpf_cnpj",
          "status",
          "competence_entry",
          "contabil",
          "fiscal",
          "cloud_types",
          "clouds",
          "customer_with_movement",
        ],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          company_name: "Alfa Comércio Ltda",
          name: "Alfa",
          cpf_cnpj: "11222333000181",
          status: "Ativo",
          competence_entry: new Date("2024-03-01T00:00:00.000Z"),
          contabil: true,
          fiscal: false,
          cloud_types: "Drive, OneDrive",
          clouds: "Drive: https://drive.test/a; OneDrive: https://one.test/a",
          customer_with_movement: true,
        },
        {
          company_name: null,
          name: "Beta",
          cpf_cnpj: "52998224725",
          status: "Inativo",
          competence_entry: null,
          contabil: false,
          fiscal: true,
          cloud_types: "",
          clouds: "",
          customer_with_movement: false,
        },
      ],
      reachedLimit: false,
    });
    expect(prisma.clients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG },
        orderBy: { id: "asc" },
        skip: 0,
        take: 11,
      }),
    );
    const related = { organization_id: ORG, client_id: { in: [CLIENT_A, CLIENT_B] } };
    expect(prisma.clouds.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: related }),
    );
    expect(prisma.responsibles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: related }),
    );
    expect(prisma.monthly.findMany).not.toHaveBeenCalled();
  });

  it("lista o movimento Contábil por competência sem rotinas arquivadas nem fiscais", async () => {
    const prisma = delegates([
      { id: "1", client_id: CLIENT_A, competence: "2026-09", triad_moviment: true },
      { id: "2", client_id: CLIENT_B, competence: "2026-09", triad_moviment: false },
      { id: "3", client_id: CLIENT_A, competence: "2026-10", triad_moviment: false },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_movement",
        organizationId: ORG,
        fields: ["competence", "sends_movement"],
        limit: 2,
        offset: 4,
      }),
    ).resolves.toEqual({
      rows: [
        { competence: "2026-09", sends_movement: true },
        { competence: "2026-09", sends_movement: false },
      ],
      reachedLimit: true,
    });
    expect(prisma.monthly.findMany).toHaveBeenCalledWith({
      where: { organization_id: ORG, type: "CONTABIL", archived_at: null },
      select: { id: true, client_id: true, competence: true, triad_moviment: true },
      orderBy: { id: "asc" },
      skip: 4,
      take: 3,
    });
    // Sem campo de cliente pedido, não consulta clientes, Clouds nem responsáveis.
    expect(prisma.clients.findMany).not.toHaveBeenCalled();
    expect(prisma.clouds.findMany).not.toHaveBeenCalled();
    expect(prisma.responsibles.findMany).not.toHaveBeenCalled();
  });
});

describe("extractTriageReportingPage: responsáveis", () => {
  it("lista as atribuições atuais com serviço, responsável e cliente da organização", async () => {
    const prisma = delegates();
    prisma.assignments.findMany.mockResolvedValue([
      { id: "1", client_id: CLIENT_A, type: "CONTABIL", user_id: USER_ANA },
      { id: "2", client_id: CLIENT_A, type: "FISCAL", user_id: USER_BRUNO },
      { id: "3", client_id: CLIENT_B, type: "FISCAL", user_id: "usuario-de-outra-organizacao" },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_responsibles",
        organizationId: ORG,
        fields: ["type", "responsible_name", "company_name"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { type: "Contábil", responsible_name: "Ana Souza", company_name: "Alfa Comércio Ltda" },
        { type: "Fiscal", responsible_name: "Bruno Lima", company_name: "Alfa Comércio Ltda" },
        { type: "Fiscal", responsible_name: null, company_name: null },
      ],
      reachedLimit: false,
    });
    expect(prisma.assignments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG },
        select: { id: true, client_id: true, type: true, user_id: true },
      }),
    );
    expect(prisma.clients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, id: { in: [CLIENT_A, CLIENT_B] } },
      }),
    );
    expect(prisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          id: { in: [USER_ANA, USER_BRUNO, "usuario-de-outra-organizacao"] },
        },
      }),
    );
    expect(prisma.competences.findMany).not.toHaveBeenCalled();
  });

  it("por competência usa o responsável da rotina, depois o congelado e por fim o atual", async () => {
    const prisma = delegates([
      {
        id: "1",
        client_id: CLIENT_A,
        competence: "2026-09",
        type: "CONTABIL",
        responsible_id: USER_ANA,
      },
      { id: "2", client_id: CLIENT_A, competence: "2026-09", type: "FISCAL", responsible_id: null },
      { id: "3", client_id: CLIENT_B, competence: "2026-09", type: "FISCAL", responsible_id: null },
    ]);
    prisma.competences.findMany.mockResolvedValue([
      {
        client_id: CLIENT_A,
        competence: "2026-09",
        responsible_snapshot: {
          responsibles: [
            { type: "CONTABIL", user_id: USER_BRUNO },
            { type: "FISCAL", user_id: USER_BRUNO },
          ],
        },
      },
    ]);
    // Cliente B não tem competência aberta: vale a atribuição atual do mesmo serviço.
    prisma.assignments.findMany.mockResolvedValue([
      { client_id: CLIENT_B, type: "CONTABIL", user_id: USER_BRUNO },
      { client_id: CLIENT_B, type: "FISCAL", user_id: USER_ANA },
      { client_id: CLIENT_A, type: "FISCAL", user_id: USER_ANA },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_competence_responsibles",
        organizationId: ORG,
        fields: ["competence", "type", "responsible_name"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { competence: "2026-09", type: "Contábil", responsible_name: "Ana Souza" },
        { competence: "2026-09", type: "Fiscal", responsible_name: "Bruno Lima" },
        { competence: "2026-09", type: "Fiscal", responsible_name: "Ana Souza" },
      ],
      reachedLimit: false,
    });
    expect(prisma.monthly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, archived_at: null },
      }),
    );
    expect(prisma.competences.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: ORG,
          client_id: { in: [CLIENT_A, CLIENT_B] },
          archived_at: null,
          competence: { in: ["2026-09"] },
        },
      }),
    );
  });
});

describe("InternalReportingService com as áreas da Triagem", () => {
  function database() {
    const prisma = {
      controlContabil: { findMany: vi.fn() },
      relationshipContabil: { findMany: vi.fn() },
      responsibleContabil: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ client_id: CLIENT_A, customer_with_movement: true }]),
      },
      client: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ skip = 0, take }: { skip?: number; take?: number }) =>
            clientRows.slice(skip, take === undefined ? undefined : skip + take),
          ),
      },
      clientClouds: { findMany: vi.fn().mockResolvedValue([]) },
      triageResponsible: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ skip = 0, take }: { skip?: number; take: number }) =>
            [
              { id: "1", client_id: CLIENT_A, type: "CONTABIL", user_id: USER_ANA },
              { id: "2", client_id: CLIENT_B, type: "FISCAL", user_id: USER_ANA },
              { id: "3", client_id: CLIENT_B, type: "CONTABIL", user_id: USER_BRUNO },
            ].slice(skip, skip + take),
          ),
      },
      triageCompetence: { findMany: vi.fn().mockResolvedValue([]) },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: USER_ANA, name: "Ana Souza" },
          { id: USER_BRUNO, name: "Bruno Lima" },
        ]),
      },
      triageMonthly: {
        findMany: vi
          .fn()
          .mockImplementation(async ({ skip = 0, take }: { skip?: number; take: number }) =>
            [
              { id: "1", client_id: CLIENT_A, competence: "2026-09", triad_moviment: true },
              { id: "2", client_id: CLIENT_B, competence: "2026-09", triad_moviment: true },
              { id: "3", client_id: CLIENT_A, competence: "2026-10", triad_moviment: false },
            ].slice(skip, skip + take),
          ),
      },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (read: (transaction: unknown) => Promise<unknown>) => read(prisma),
    );
    return prisma;
  }

  it("aplica os filtros de competência, serviço e cliente ao movimento enviado", async () => {
    const result = await new InternalReportingService(database() as never).extract({
      organizationId: ORG,
      source: "contabil.triage_movement",
      fields: ["company_name", "competence"],
      limit: 50,
      query: {
        filters: [
          { field: "competence", operator: "eq", parameter: "competencia", value: "2026-09" },
          { field: "contabil", operator: "eq", parameter: "servico", value: true },
          { field: "sends_movement", operator: "eq", parameter: "envia", value: true },
        ],
      },
    });

    expect(result.rows).toEqual([{ company_name: "Alfa Comércio Ltda", competence: "2026-09" }]);
  });

  it("lista clientes do Contábil sem movimento, como o relatório legado", async () => {
    const result = await new InternalReportingService(database() as never).extract({
      organizationId: ORG,
      source: "contabil.triage_clouds",
      fields: ["name"],
      limit: 50,
      query: {
        filters: [
          { field: "customer_with_movement", operator: "eq", parameter: "movimento", value: false },
        ],
      },
    });

    expect(result.rows).toEqual([{ name: "Beta" }]);
  });

  it("lista os clientes atribuídos a um usuário em um serviço, como o relatório legado", async () => {
    const result = await new InternalReportingService(database() as never).extract({
      organizationId: ORG,
      source: "contabil.triage_responsibles",
      fields: ["name"],
      limit: 50,
      query: {
        filters: [
          { field: "responsible_name", operator: "eq", parameter: "usuario", value: "Ana Souza" },
          { field: "type", operator: "eq", parameter: "servico", value: "Fiscal" },
        ],
      },
    });

    expect(result.rows).toEqual([{ name: "Beta" }]);
  });

  it("recusa campo fora do catálogo das áreas da Triagem", async () => {
    const prisma = { client: { findMany: vi.fn() } };

    await expect(
      new InternalReportingService(prisma as never).extract({
        organizationId: ORG,
        source: "contabil.triage_clouds",
        fields: ["organization_id"],
        limit: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });
});

describe("extractTriageReportingPage: métrica Contábil", () => {
  it("tira 'não possui' e item desativado do denominador e aceita estados do legado", async () => {
    const prisma = delegates([
      {
        id: "1",
        client_id: CLIENT_A,
        competence: "2026-09",
        checklist: {
          financial_transactions: "COMPLETED",
          triaged_transactions: "COMPLETED",
          inventory_control: "COMPLETED",
          accounts_payable_report: "concluido",
          accounts_receivable_report: "NOT_PRESENT",
          card_statements: "nao possui",
          loan_agreements: "NOT_APPLICABLE",
          bank_reconciliation: "ATTENTION",
          bank_investments: "PENDING",
          // card_sales_report ausente: não fazia parte do movimento.
        },
      },
      {
        id: "2",
        client_id: CLIENT_B,
        competence: "2026-09",
        checklist: Object.fromEntries(
          TRIAGE_ACCOUNTING_CHECKLIST_FIELDS.map((field) => [field, "NOT_PRESENT"]),
        ),
      },
    ]);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_accounting_metric",
        organizationId: ORG,
        fields: ["name", "competence", "completed_items", "applicable_items", "completion_percent"],
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        {
          name: "Alfa",
          competence: "2026-09",
          completed_items: 4,
          applicable_items: 6,
          completion_percent: 66.67,
        },
        {
          name: "Beta",
          competence: "2026-09",
          completed_items: 0,
          applicable_items: 0,
          completion_percent: null,
        },
      ],
      reachedLimit: false,
    });
    expect(prisma.monthly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, type: "CONTABIL", archived_at: null },
        select: { id: true, client_id: true, competence: true, checklist: true },
      }),
    );
  });
});

describe("SGQ da Triagem", () => {
  const CLIENT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const CLIENT_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const CLIENT_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const client = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    status: "Ativo",
    competence_entry: null,
    competence_output: null,
    deletion_date: null,
    ...overrides,
  });
  const sgqClients = [
    client(CLIENT_A, { competence_entry: utc("2025-12-01") }),
    client(CLIENT_C),
    client(CLIENT_D, { competence_output: utc("2025-12-15") }),
    client(CLIENT_E, { status: "Inativo", deletion_date: utc("2026-01-10") }),
    // Inativo sem data não tem como ser datado: fica fora de todos os meses.
    client(CLIENT_B, { status: "Inativo" }),
  ];
  const routines = [
    { client_id: CLIENT_C, competence: "2025-11", checklist: { triaged_transactions: "PENDING" } },
    { client_id: CLIENT_D, competence: "2025-12", checklist: { triaged_transactions: "" } },
    {
      client_id: CLIENT_A,
      competence: "2026-01",
      checklist: { triaged_transactions: "NOT_PRESENT" },
    },
    {
      client_id: CLIENT_C,
      competence: "2026-02",
      checklist: { triaged_transactions: "COMPLETED" },
    },
  ];
  const fields = ["competence", "not_sent", "not_triaged", "triaged", "eligible_clients"];
  const today = utc("2026-02-20");

  it("enumera os meses do intervalo atravessando a virada do ano", () => {
    expect(competencesBetween("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(competencesBetween("2024-12", "2026-01")).toHaveLength(14);
    expect(competencesBetween("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("conta por mês só quem está na carteira Contábil daquele mês", async () => {
    const prisma = delegates(routines);
    prisma.clients.findMany.mockResolvedValue(sgqClients);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_sgq",
        organizationId: ORG,
        today,
        fields,
        limit: 10,
      }),
    ).resolves.toEqual({
      rows: [
        { competence: "2025-11", not_sent: 2, not_triaged: 1, triaged: 0, eligible_clients: 3 },
        { competence: "2025-12", not_sent: 3, not_triaged: 1, triaged: 0, eligible_clients: 4 },
        { competence: "2026-01", not_sent: 2, not_triaged: 0, triaged: 1, eligible_clients: 3 },
        { competence: "2026-02", not_sent: 1, not_triaged: 0, triaged: 1, eligible_clients: 2 },
      ],
      reachedLimit: false,
    });
    expect(prisma.clients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, contabil: true } }),
    );
    for (const [query] of prisma.monthly.findMany.mock.calls) {
      expect(query.where).toMatchObject({
        organization_id: ORG,
        type: "CONTABIL",
        archived_at: null,
      });
    }
  });

  it("segue até o mês corrente, com quem ainda não enviou, e ignora competência malformada", async () => {
    const prisma = delegates([...routines, { client_id: CLIENT_C, competence: "02/2026" }]);
    prisma.clients.findMany.mockResolvedValue(sgqClients);

    const result = await extractTriageReportingPage(prisma, {
      source: "contabil.triage_sgq",
      organizationId: ORG,
      fields: ["competence", "not_sent", "eligible_clients"],
      limit: 10,
      today: utc("2026-04-02"),
    });

    expect(result.rows.slice(-2)).toEqual([
      { competence: "2026-03", not_sent: 2, eligible_clients: 2 },
      { competence: "2026-04", not_sent: 2, eligible_clients: 2 },
    ]);
    expect(result.rows).toHaveLength(6);
    expect(competencesBetween("2026-01", "abc")).toEqual([]);
  });

  it("pagina os meses e filtra o intervalo pedido pela Central", async () => {
    const prisma = delegates(routines);
    prisma.clients.findMany.mockResolvedValue(sgqClients);

    await expect(
      extractTriageReportingPage(prisma, {
        source: "contabil.triage_sgq",
        organizationId: ORG,
        today,
        fields: ["competence"],
        limit: 2,
        offset: 1,
      }),
    ).resolves.toEqual({
      rows: [{ competence: "2025-12" }, { competence: "2026-01" }],
      reachedLimit: true,
    });

    const database = {
      client: { findMany: vi.fn().mockResolvedValue(sgqClients) },
      triageMonthly: { findMany: vi.fn().mockResolvedValue(routines) },
      $transaction: vi.fn(),
    };
    database.$transaction.mockImplementation(
      async (read: (transaction: unknown) => Promise<unknown>) => read(database),
    );
    const result = await new InternalReportingService(database as never).extract({
      organizationId: ORG,
      source: "contabil.triage_sgq",
      fields: ["competence", "not_sent"],
      limit: 50,
      query: {
        filters: [
          {
            field: "competence",
            operator: "between",
            parameter: "periodo",
            value: ["2025-12", "2026-01"],
          },
        ],
      },
    });

    expect(result.rows).toEqual([
      { competence: "2025-12", not_sent: 3 },
      { competence: "2026-01", not_sent: 2 },
    ]);
  });
});
