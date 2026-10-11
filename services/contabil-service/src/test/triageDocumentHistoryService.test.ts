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
const CONTROL = "99999999-9999-4999-8999-999999999999";
const ARCHIVE_ACTIONS = {
  in: ["Arquivar competência contábil", "Restaurar competência contábil"],
};

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
    triageCatalogItem: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { kind: "JUSTIFICATION", code: "SEM_MOVIMENTO", label: "Sem movimento no mês" },
        ]),
    },
    controlContabil: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: CONTROL, client_id: CLIENT, competence: "2026-09" }]),
    },
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

  it("só publica os campos conhecidos: coluna nova não vaza pelo histórico", () => {
    expect(
      triageDocumentChanges({
        status: { from: "PENDING", to: "COMPLETED" },
        token_interno: { from: "a", to: "b" },
        organization_id: { from: "x", to: "y" },
      }),
    ).toEqual([{ field: "status", from: "PENDING", to: "COMPLETED" }]);
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
          // Justificativa sai pelo rótulo do catálogo da organização.
          {
            field: "item_notes.sped_fiscal.justification",
            from: null,
            to: "Sem movimento no mês",
          },
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
          OR: [
            { referring: "triagem.monthly", referring_id: { in: [MONTHLY] } },
            { referring: "triagem.bank_statements", referring_id: { in: [STATEMENT] } },
            { referring: "clientes.clouds", referring_id: { in: [CLOUD] } },
            // Configuração é auditada com o id do cliente.
            { referring: "triagem.configs", referring_id: { in: [CLIENT] } },
            {
              referring: "contabil.control",
              action: ARCHIVE_ACTIONS,
              referring_id: { in: [CONTROL] },
            },
          ],
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
      prisma.triageCatalogItem,
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
    // Sem cliente nem competência não há recorte por objeto: é a organização inteira, e do
    // controle contábil só entram arquivar e restaurar a competência.
    expect(prisma.auditRequest.findMany.mock.calls[0][0].where.OR).toEqual([
      { referring: "triagem.monthly" },
      { referring: "triagem.bank_statements" },
      { referring: "triagem.closings" },
      { referring: "clientes.clouds" },
      { referring: "triagem.configs" },
      { referring: "contabil.control", action: ARCHIVE_ACTIONS },
    ]);
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
    expect(prisma.auditRequest.findMany.mock.calls[0][0].where.OR).toEqual([
      { referring: "triagem.monthly", referring_id: { in: [MONTHLY] } },
      { referring: "triagem.bank_statements", referring_id: { in: [STATEMENT] } },
      { referring: "contabil.control", action: ARCHIVE_ACTIONS, referring_id: { in: [CONTROL] } },
    ]);
    // As consultas de Cloud aqui são só as que resolvem o objeto dos eventos da página.
    for (const [query] of prisma.clientCloud.findMany.mock.calls) {
      expect(query.where).toHaveProperty("id");
    }
  });

  it("sem objeto no recorte devolve vazio sem ler a auditoria", async () => {
    const prisma = database();
    for (const delegate of [
      prisma.triageMonthly,
      prisma.triageBankStatement,
      prisma.controlContabil,
    ]) {
      delegate.findMany.mockResolvedValue([]);
    }

    await expect(
      listTriageDocumentHistory(prisma, {
        organizationId: ORG,
        competence: "2026-09",
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ total: 0, items: [] });
    expect(prisma.auditRequest.findMany).not.toHaveBeenCalled();
  });

  it("devolve todo evento contado: sem campo exibível, o evento sai sem alterações", async () => {
    const prisma = database();
    const noDisplayable = [
      // Só carimbos.
      { updated_at: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-13T08:00:00.000Z" } },
      // Regravação sem mudança: o JSON vem inteiro no evento, igual dos dois lados.
      {
        checklist: { from: { sped_fiscal: "PENDING" }, to: { sped_fiscal: "PENDING" } },
        notes: { from: null, to: "" },
      },
    ].map((changes_json, index) => ({
      id: `event-sem-campo-${index}`,
      user_id: USER,
      created_at: new Date("2026-09-13T08:00:00.000Z"),
      action: "Atualizar pendência documental",
      referring: "triagem.monthly",
      referring_id: MONTHLY,
      changes_json,
    }));
    const events = [...noDisplayable, ...prisma.events];
    prisma.auditRequest.findMany.mockResolvedValue(events);
    prisma.auditRequest.count.mockResolvedValue(events.length);

    const result = await listTriageDocumentHistory(prisma, {
      organizationId: ORG,
      clientId: CLIENT,
      page: 1,
      pageSize: 20,
    });

    // A paginação é da consulta: o que conta no total está na página.
    expect(result.total).toBe(5);
    expect(result.items.map((item) => item.id)).toEqual(events.map((event) => event.id));
    expect(result.items[0]).toMatchObject({
      actor: { id: USER, name: "Ana Souza" },
      action: "Atualizar pendência documental",
      object: { kind: "triagem.monthly", client_name: "Alfa Comércio Ltda", competence: "2026-09" },
      changes: [],
    });
    expect(result.items[1].changes).toEqual([]);
  });

  it("mostra configuração (auditada pelo cliente) e arquivamento da competência (auditado no controle)", async () => {
    const prisma = database();
    prisma.auditRequest.findMany.mockResolvedValue([
      {
        id: "event-5",
        user_id: USER,
        created_at: new Date("2026-09-20T12:00:00.000Z"),
        action: "Arquivar competência contábil",
        referring: "contabil.control",
        referring_id: CONTROL,
        changes_json: {
          archived_at: { from: null, to: "2026-09-20T12:00:00.000Z" },
          monthly: { from: undefined, to: 1 },
          statements: { from: undefined, to: 2 },
        },
      },
      {
        id: "event-4b",
        user_id: USER,
        created_at: new Date("2026-09-19T18:00:00.000Z"),
        action: "Restaurar competência contábil",
        referring: "contabil.control",
        referring_id: CONTROL,
        changes_json: { monthly: { to: 1 }, statements: { to: 2 }, closings: { to: 0 } },
      },
      {
        id: "event-4",
        user_id: USER,
        created_at: new Date("2026-09-19T12:00:00.000Z"),
        action: "Configurar documentos fiscais especiais",
        referring: "triagem.configs",
        referring_id: CLIENT,
        changes_json: {
          active_items: { from: ["sped_fiscal"], to: ["sped_fiscal", "nfce_documents"] },
        },
      },
      {
        id: "event-3b",
        user_id: USER,
        created_at: new Date("2026-09-18T12:00:00.000Z"),
        action: "Atualizar movimento mensal da triagem",
        referring: "triagem.monthly",
        referring_id: MONTHLY,
        changes_json: { responsible_id: { from: null, to: USER } },
      },
    ]);

    const result = await listTriageDocumentHistory(prisma, {
      organizationId: ORG,
      clientId: CLIENT,
      page: 1,
      pageSize: 20,
    });

    expect(result.items).toMatchObject([
      {
        action: "Arquivar competência contábil",
        object: {
          kind: "contabil.control",
          client_name: "Alfa Comércio Ltda",
          competence: "2026-09",
        },
        changes: [
          { field: "archived_at", from: null, to: "2026-09-20T12:00:00.000Z" },
          { field: "monthly", from: null, to: "1" },
          { field: "statements", from: null, to: "2" },
        ],
      },
      {
        action: "Restaurar competência contábil",
        object: { kind: "contabil.control", competence: "2026-09" },
        changes: [
          { field: "monthly", from: null, to: "1" },
          { field: "statements", from: null, to: "2" },
          { field: "closings", from: null, to: "0" },
        ],
      },
      {
        action: "Configurar documentos fiscais especiais",
        object: { kind: "triagem.configs", client_id: CLIENT, client_name: "Alfa Comércio Ltda" },
        changes: [
          {
            field: "active_items",
            from: '["sped_fiscal"]',
            to: '["sped_fiscal","nfce_documents"]',
          },
        ],
      },
      // Responsável sai pelo nome, não pelo id.
      { changes: [{ field: "responsible_id", from: null, to: "Ana Souza" }] },
    ]);
  });
});
