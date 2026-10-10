import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  listTriageDocumentHistory,
  triageDocumentChanges,
} from "../services/triageDocumentHistoryService.js";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const MONTHLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STATEMENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CLOUD = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function database() {
  const events = [
    {
      id: "event-3",
      user_id: USER,
      created_at: new Date("2026-09-12T15:00:00.000Z"),
      action: "Arquivar marcador de extrato bancário",
      referring: "triagem.bank_statements",
      referring_id: STATEMENT,
      changes_json: {
        archived_at: { from: null, to: "2026-09-12T15:00:00.000Z" },
        updated_at: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-12T15:00:00.000Z" },
      },
    },
    {
      id: "event-2",
      user_id: USER,
      created_at: new Date("2026-09-11T10:00:00.000Z"),
      action: "Atualizar pendência documental",
      referring: "triagem.monthly",
      referring_id: MONTHLY,
      changes_json: {
        checklist: {
          from: { sped_fiscal: "PENDING", inbound_report: "COMPLETED" },
          to: { sped_fiscal: "NOT_PRESENT", inbound_report: "COMPLETED" },
        },
        item_notes: {
          from: { sped_fiscal: { note: null, justification: null } },
          to: { sped_fiscal: { note: null, justification: "SEM_MOVIMENTO" } },
        },
        updated_at: { from: "a", to: "b" },
      },
    },
    {
      id: "event-1",
      user_id: null,
      created_at: new Date("2026-09-10T09:00:00.000Z"),
      action: "Cadastrar nuvem do cliente",
      referring: "clientes.clouds",
      referring_id: CLOUD,
      changes_json: { type: "Drive", link: "https://drive.test/a" },
    },
  ];
  return {
    events,
    auditRequest: {
      findMany: vi.fn().mockResolvedValue(events),
      count: vi.fn().mockResolvedValue(events.length),
    },
    client: {
      findFirst: vi.fn().mockResolvedValue({ id: CLIENT }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: CLIENT, name: "Alfa", company_name: "Alfa Comércio Ltda" }]),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: USER, name: "Ana Souza" }]) },
    triageMonthly: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: MONTHLY, client_id: CLIENT, competence: "2026-09", type: "FISCAL" },
        ]),
    },
    triageBankStatement: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: STATEMENT, client_id: CLIENT, competence: "2026-09", bank_id: "bank-1" },
        ]),
    },
    triageClosing: { findMany: vi.fn().mockResolvedValue([]) },
    clientCloud: { findMany: vi.fn().mockResolvedValue([{ id: CLOUD, client_id: CLIENT }]) },
    triageConfig: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("triageDocumentChanges", () => {
  it("abre checklist e notas por item e ignora carimbos e valores iguais", () => {
    expect(
      triageDocumentChanges({
        checklist: {
          from: { a: "PENDING", b: "COMPLETED" },
          to: { a: "COMPLETED", b: "COMPLETED" },
        },
        item_notes: {
          from: { a: { note: "", justification: null } },
          to: { a: { note: "Recebido por e-mail", justification: null } },
        },
        triad_moviment: { from: false, to: true },
        notes: { from: null, to: "" },
        updated_at: { from: "x", to: "y" },
      }),
    ).toEqual([
      { field: "checklist.a", from: "PENDING", to: "COMPLETED" },
      { field: "item_notes.a.note", from: null, to: "Recebido por e-mail" },
      { field: "triad_moviment", from: false, to: true },
    ]);
  });

  it("trata o registro criado como valor novo, sem anterior", () => {
    expect(triageDocumentChanges({ type: "Drive", link: "https://drive.test/a" })).toEqual([
      { field: "type", from: null, to: "Drive" },
      { field: "link", from: null, to: "https://drive.test/a" },
    ]);
    expect(triageDocumentChanges("texto livre")).toEqual([]);
  });
});

describe("listTriageDocumentHistory", () => {
  it("lista documentos, justificativas, Cloud e remoções do cliente com ator, instante e objeto", async () => {
    const prisma = database();

    const result = await listTriageDocumentHistory(prisma, {
      organizationId: ORG,
      clientId: CLIENT,
      page: 2,
      pageSize: 3,
    });

    expect(result).toMatchObject({ client_id: CLIENT, competence: null, page: 2, total: 3 });
    expect(result.items).toEqual([
      {
        id: "event-3",
        at: "2026-09-12T15:00:00.000Z",
        actor: { id: USER, name: "Ana Souza" },
        action: "Arquivar marcador de extrato bancário",
        object: {
          kind: "triagem.bank_statements",
          client_id: CLIENT,
          client_name: "Alfa Comércio Ltda",
          competence: "2026-09",
          routine_type: null,
        },
        changes: [{ field: "archived_at", from: null, to: "2026-09-12T15:00:00.000Z" }],
      },
      {
        id: "event-2",
        at: "2026-09-11T10:00:00.000Z",
        actor: { id: USER, name: "Ana Souza" },
        action: "Atualizar pendência documental",
        object: {
          kind: "triagem.monthly",
          client_id: CLIENT,
          client_name: "Alfa Comércio Ltda",
          competence: "2026-09",
          routine_type: "FISCAL",
        },
        changes: [
          { field: "checklist.sped_fiscal", from: "PENDING", to: "NOT_PRESENT" },
          { field: "item_notes.sped_fiscal.justification", from: null, to: "SEM_MOVIMENTO" },
        ],
      },
      {
        id: "event-1",
        at: "2026-09-10T09:00:00.000Z",
        actor: null,
        action: "Cadastrar nuvem do cliente",
        object: {
          kind: "clientes.clouds",
          client_id: CLIENT,
          client_name: "Alfa Comércio Ltda",
          competence: null,
          routine_type: null,
        },
        changes: [
          { field: "type", from: null, to: "Drive" },
          { field: "link", from: null, to: "https://drive.test/a" },
        ],
      },
    ]);
    // Páginas além da primeira: o deslocamento vai para a consulta da auditoria.
    expect(prisma.auditRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: ORG,
          referring_id: { in: [MONTHLY, STATEMENT, CLOUD] },
        }),
        skip: 3,
        take: 3,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("limita toda consulta à organização, inclusive nomes de cliente e de usuário", async () => {
    const prisma = database();

    await listTriageDocumentHistory(prisma, { organizationId: ORG, page: 1, pageSize: 20 });

    const delegates = [
      prisma.auditRequest,
      prisma.client,
      prisma.user,
      prisma.triageMonthly,
      prisma.triageBankStatement,
      prisma.clientCloud,
    ];
    for (const delegate of delegates) {
      expect(delegate.findMany).toHaveBeenCalled();
      for (const [query] of delegate.findMany.mock.calls) {
        expect(query.where).toMatchObject({ organization_id: ORG });
      }
    }
    // Sem cliente nem competência não há recorte por objeto: é a organização inteira.
    expect(prisma.auditRequest.findMany.mock.calls[0][0].where).not.toHaveProperty("referring_id");
    expect(prisma.auditRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ organization_id: ORG }),
    });
  });

  it("recusa cliente de outra organização sem consultar a auditoria", async () => {
    const prisma = database();
    prisma.client.findFirst.mockResolvedValue(null);

    await expect(
      listTriageDocumentHistory(prisma, {
        organizationId: ORG,
        clientId: CLIENT,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, id: CLIENT } }),
    );
    expect(prisma.auditRequest.findMany).not.toHaveBeenCalled();
  });

  it("por competência deixa de fora Cloud e configuração, que são do cliente", async () => {
    const prisma = database();

    await listTriageDocumentHistory(prisma, {
      organizationId: ORG,
      clientId: CLIENT,
      competence: "2026-09",
      page: 1,
      pageSize: 20,
    });

    expect(prisma.triageMonthly.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, client_id: CLIENT, competence: "2026-09" },
      }),
    );
    expect(prisma.auditRequest.findMany.mock.calls[0][0].where.referring_id).toEqual({
      in: [MONTHLY, STATEMENT],
    });
    // As consultas de Cloud aqui são só as que resolvem o objeto dos eventos da página.
    for (const [query] of prisma.clientCloud.findMany.mock.calls) {
      expect(query.where).toHaveProperty("id");
    }
    expect(prisma.triageConfig.findMany).not.toHaveBeenCalled();
  });

  it("sem objeto no recorte devolve vazio sem ler a auditoria", async () => {
    const prisma = database();
    for (const delegate of [prisma.triageMonthly, prisma.triageBankStatement, prisma.clientCloud]) {
      delegate.findMany.mockResolvedValue([]);
    }

    await expect(
      listTriageDocumentHistory(prisma, {
        organizationId: ORG,
        clientId: CLIENT,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    expect(prisma.auditRequest.findMany).not.toHaveBeenCalled();
  });
});
