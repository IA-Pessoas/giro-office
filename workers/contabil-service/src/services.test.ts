import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { documentItemSchema } from "./schemas.js";
import {
  createClosingService,
  createControlService,
  createDocumentsService,
  createRelationshipService,
  createResponsibleService,
} from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MONTHLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn() },
    triageResponsible: { findFirst: vi.fn() },
    triageConfig: { findFirst: vi.fn() },
    triageMonthly: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    triageBankStatement: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    triageClosing: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    triageCompetence: { findFirst: vi.fn(), update: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn(), findMany: vi.fn() },
    triageCompetenceCatalogSnapshot: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  return database;
}

const auth = { userId: USER, organizationId: ORG, modules: { contabil: 2 } };

describe("contabil services tenant and catalog seams", () => {
  it("restaurar a competência audita no controle, com as contagens, como o arquivamento (#1689)", async () => {
    const CONTROL = "99999999-9999-4999-8999-999999999999";
    const updateMany = (count: number) => ({ updateMany: vi.fn().mockReturnValue({ count }) });
    const database = {
      controlContabil: {
        ...updateMany(1),
        findFirst: vi.fn().mockResolvedValue({ id: CONTROL }),
      },
      triageMonthly: updateMany(1),
      triageBankStatement: updateMany(2),
      triageClosing: updateMany(0),
      $transaction: vi.fn(async (operations: unknown[]) => operations),
    };
    const auditLog = audit();

    await expect(
      createControlService(database as never, auditLog).restoreCompetence({
        userId: USER,
        organizationId: ORG,
        permission: 2,
        clientId: CLIENT,
        competence: "2026-09",
      }),
    ).resolves.toEqual({ controls: 1, monthly: 1, statements: 2, closings: 0 });

    expect(database.controlContabil.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT, competence: "2026-09", organization_id: ORG },
      select: { id: true },
    });
    // O histórico documental lê este evento pelo id do controle; sem contagens ele sumia.
    expect(auditLog.logUpdateIfChanged).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: "Restaurar competência contábil",
        referring: "contabil.control",
        referringId: CONTROL,
        organizationId: ORG,
        updatedData: { controls: 1, monthly: 1, statements: 2, closings: 0 },
      }),
    );
    expect(auditLog.createLog).not.toHaveBeenCalled();
  });

  it("lista carteira com CNPJ, regime e responsáveis do tenant", async () => {
    const database = {
      client: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: CLIENT,
            name: "Art",
            company_name: "ART TOLDO",
            cpf_cnpj: "49791761000380",
            regime: "Lucro Real",
            controlContabil: [],
            triageClosings: [],
          },
          {
            id: MONTHLY,
            name: "Sem responsável",
            company_name: null,
            cpf_cnpj: "",
            regime: null,
            controlContabil: [],
            triageClosings: [],
          },
        ]),
      },
      responsibleContabil: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { client_id: CLIENT, person_responsible_id: "user-1", posted_by_id: "user-2" },
          ]),
      },
    };
    const result = (await createControlService(database as never, audit()).list(
      "2026-08",
      ORG,
    )) as {
      items: Record<string, unknown>[];
    };

    expect(database.responsibleContabil.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, client_id: { in: [CLIENT, MONTHLY] } },
      }),
    );
    expect(result.items[0]).toMatchObject({
      legal_name: "ART TOLDO",
      cpf_cnpj: "49791761000380",
      regime: "Lucro Real",
      person_responsible_id: "user-1",
      posted_by_id: "user-2",
    });
    expect(result.items[1]).toMatchObject({
      regime: null,
      person_responsible_id: null,
      posted_by_id: null,
    });
  });

  it("carteiras de competência passada respeitam entrada, saída e inativação (#1690)", async () => {
    const start = new Date("2025-03-01T00:00:00.000Z");
    const end = new Date("2025-03-31T23:59:59.999Z");
    const window = [
      { OR: [{ competence_entry: null }, { competence_entry: { lte: end } }] },
      { OR: [{ competence_output: null }, { competence_output: { gte: start } }] },
      {
        OR: [
          { deletion_date: { gte: start } },
          { deletion_date: null, NOT: { status: "Inativo" } },
        ],
      },
    ];
    const database = {
      client: { findMany: vi.fn().mockResolvedValue([]) },
      responsibleContabil: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await createControlService(database as never, audit()).list("2025-03", ORG);
    await createDocumentsService(database as never, audit()).listFiscalPortfolio("2025-03", {
      userId: USER,
      organizationId: ORG,
      modules: { fiscal: 1 },
    });

    const [contabil, fiscal] = database.client.findMany.mock.calls.map(([args]) => args.where);
    expect(contabil).toEqual({
      organization_id: ORG,
      OR: [
        { AND: [{ OR: [{ contabil: true }, { contabil: null }] }, ...window] },
        {
          controlContabil: {
            some: { competence: "2025-03", organization_id: ORG, archived_at: null },
          },
        },
      ],
    });
    expect(fiscal).toEqual({
      organization_id: ORG,
      OR: [
        { fiscal: true, AND: window },
        {
          triageMonthlys: {
            some: {
              organization_id: ORG,
              competence: "2025-03",
              archived_at: null,
              type: "FISCAL",
            },
          },
        },
      ],
    });
  });

  describe("elegibilidade para criar competências (#1323)", () => {
    const base = { clientId: CLIENT, userId: USER, organizationId: ORG, permission: 2 };
    function controlDb(contabil: boolean | null | undefined) {
      return {
        client: {
          findFirst: vi.fn().mockResolvedValue(contabil === undefined ? null : { contabil }),
        },
        controlContabil: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(async ({ data }) => ({ id: "control-1", ...data })),
          createMany: vi.fn(async ({ data }) => ({ count: data.length })),
        },
      };
    }

    it("cria as 12 competências para cliente com contabil nulo, como a tela permite", async () => {
      const database = controlDb(null);
      const result = await createControlService(database as never, audit()).createYear({
        ...base,
        year: 2026,
        confirmed: true,
      });
      expect(result).toMatchObject({ created: 12, existing: 0 });
    });

    it("bloqueia mês e ano com a mesma mensagem quando o serviço contábil não é contratado", async () => {
      const service = createControlService(controlDb(false) as never, audit());
      const expected = {
        statusCode: 400,
        message: "Serviço contábil não contratado para este cliente.",
      };
      await expect(service.create({ ...base, competence: "2026-09" })).rejects.toMatchObject(
        expected,
      );
      await expect(
        service.createYear({ ...base, year: 2026, confirmed: true }),
      ).rejects.toMatchObject(expected);
    });

    it("responde 404 para cliente de outra organização nas duas ações", async () => {
      const service = createControlService(controlDb(undefined) as never, audit());
      await expect(service.create({ ...base, competence: "2026-09" })).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        service.createYear({ ...base, year: 2026, confirmed: true }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it("responsável e relacionamento sem registro devolvem null (#1325)", async () => {
    const database = {
      responsibleContabil: { findFirst: vi.fn().mockResolvedValue(null) },
      relationshipContabil: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      createResponsibleService(database as never, audit()).getByClientId(CLIENT, ORG),
    ).resolves.toBeNull();
    await expect(
      createRelationshipService(database as never, audit()).getByClientId(CLIENT, ORG),
    ).resolves.toBeNull();
  });

  it("relacionamento aceita estados não selecionados e só mantém texto livre legado (#1721)", async () => {
    const legacy = {
      id: "rel-1",
      client_id: CLIENT,
      bidding: true,
      chart_accounts: "Plano próprio",
    };
    const database = {
      relationshipContabil: {
        findFirst: vi.fn(),
        create: vi.fn(async ({ data }) => ({ id: "rel-1", ...data })),
        update: vi.fn(async ({ data }) => ({ ...legacy, ...data })),
      },
    };
    const trail = audit();
    const service = createRelationshipService(database as never, trail);
    const base = { client_id: CLIENT, tool: "t", system: "s", note: "" };

    database.relationshipContabil.findFirst.mockResolvedValue(null);
    await service.create({ ...base, bidding: null, chart_accounts: "Não — Jonrick" }, auth);
    expect(trail.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Cadastro",
        referring: "contabil.relationship",
        oldData: {},
        updatedData: expect.objectContaining({ chart_accounts: "Não — Jonrick" }),
      }),
    );
    expect(database.relationshipContabil.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bidding: null, chart_accounts: "Não — Jonrick" }),
    });
    await expect(
      service.create({ ...base, bidding: false, chart_accounts: "Plano próprio" }, auth),
    ).rejects.toMatchObject({ statusCode: 400 });

    database.relationshipContabil.findFirst.mockResolvedValue(legacy);
    await service.update("rel-1", { chart_accounts: "Plano próprio", bidding: null }, auth);
    expect(trail.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        oldData: legacy,
        updatedData: { ...legacy, bidding: null },
      }),
    );
    await expect(
      service.update("rel-1", { chart_accounts: "Outro plano" }, auth),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(database.relationshipContabil.update).toHaveBeenCalledTimes(1);
  });

  it("grava responsáveis ausentes como null em vez do default '' que viola a FK", async () => {
    const database = {
      responsibleContabil: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => ({ id: "responsible-1", ...data })),
      },
    };
    const service = createResponsibleService(database as never, audit());

    await service.create({ client_id: CLIENT, customer_with_movement: false }, auth);

    expect(database.responsibleContabil.create).toHaveBeenCalledWith({
      data: {
        client_id: CLIENT,
        organization_id: ORG,
        person_responsible_id: null,
        posted_by_id: null,
        customer_with_movement: false,
      },
    });
  });

  it("devolve 400 quando responsável ou lançado por não existe", async () => {
    const database = {
      responsibleContabil: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(Object.assign(new Error("fk"), { code: "P2003" })),
      },
    };
    const service = createResponsibleService(database as never, audit());

    await expect(
      service.create({ client_id: CLIENT, posted_by_id: USER }, auth),
    ).rejects.toMatchObject({ statusCode: 400 });

    database.responsibleContabil.findFirst.mockResolvedValue({ id: "responsible-1" });
    Object.assign(database.responsibleContabil, {
      update: vi.fn().mockRejectedValue(Object.assign(new Error("fk"), { code: "P2003" })),
    });
    await expect(
      service.update("responsible-1", { posted_by_id: USER }, auth),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lista carteira fiscal com responsável do snapshot e checklist planejado", async () => {
    const database = {
      client: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: CLIENT,
            name: "Art",
            company_name: " ",
            cpf_cnpj: "49791761000380",
            regime: "Simples",
            triageMonthlys: [],
            triageCompetences: [
              {
                id: "competence-1",
                responsible_snapshot: { responsibles: [{ type: "FISCAL", user_id: "u-snap" }] },
                configuration_snapshot: {
                  configs: [
                    {
                      type: "FISCAL",
                      active_items: ["sped_fiscal", { field: "nfse_received", required: false }],
                    },
                  ],
                },
              },
            ],
            responsiblesTriage: [{ user_id: USER }],
          },
          {
            id: MONTHLY,
            name: "Sem competência",
            company_name: "SEM COMP",
            cpf_cnpj: "1",
            regime: null,
            triageMonthlys: [
              { id: "m-1", checklist: { sped_fiscal: "COMPLETED" }, item_notes: {} },
            ],
            triageCompetences: [],
            responsiblesTriage: [],
          },
        ]),
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: "u-snap", name: "Snap" }]) },
      triageConfig: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ client_id: CLIENT, priority: true, delivery_method: "EMAIL" }]),
      },
    };
    const service = createDocumentsService(database as never, audit());

    const result = (await service.listFiscalPortfolio("2026-09", {
      userId: USER,
      organizationId: ORG,
      modules: { fiscal: 1 },
    })) as { items: Record<string, unknown>[] };

    expect(database.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organization_id: ORG, id: { in: ["u-snap"] } } }),
    );
    expect(database.triageConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: ORG, type: "FISCAL", client_id: { in: [CLIENT, MONTHLY] } },
      }),
    );
    expect(result.items[0]).toMatchObject({
      legal_name: "Art",
      priority: true,
      delivery_method: "EMAIL",
      responsible_id: "u-snap",
      responsible_name: "Snap",
      can_edit: true,
      has_competence: true,
      planned_checklist: expect.objectContaining({
        sped_fiscal: "PENDING",
        nfse_received: "NOT_APPLICABLE",
      }),
      monthly: null,
    });
    expect(result.items[1]).toMatchObject({
      priority: false,
      delivery_method: null,
      responsible_id: null,
      can_edit: false,
      has_competence: false,
      planned_checklist: null,
      monthly: { id: "m-1", checklist: expect.objectContaining({ sped_fiscal: "COMPLETED" }) },
    });
    await expect(
      service.listFiscalPortfolio("2026-09", { userId: USER, organizationId: ORG, modules: {} }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("GET mensal sem registro devolve null em vez de 404 (#1322)", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.getMonthly({ client_id: CLIENT, competence: "2026-09" }, auth),
    ).resolves.toBeNull();
  });

  it("GET mensal sem competência na Triagem devolve resumo null em vez de 502 (#1322)", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      competence: "2026-09",
      checklist: {},
      item_notes: {},
    });
    const getSummary = vi
      .fn()
      .mockRejectedValue(new ServiceError(404, "Resumo da Triagem não encontrado."));
    const service = createDocumentsService(database as never, audit(), { getSummary });

    await expect(
      service.getMonthly({ client_id: CLIENT, competence: "2026-09" }, auth),
    ).resolves.toMatchObject({ id: MONTHLY, triagem_summary: null });
  });

  it("recusa marcador bancário de cliente fora do tenant", async () => {
    const database = prisma();
    database.client.findFirst.mockResolvedValue(null);
    database.triageBankStatement.findFirst.mockResolvedValue(null);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.upsertStatement(
        { client_id: CLIENT, competence: "2026-09", bank_id: "bank-1", status: "PENDING" },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.triageBankStatement.upsert).not.toHaveBeenCalled();
  });

  it("recusa justificativa fora do catálogo da competência", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      checklist: {},
      item_notes: {},
    });
    database.triageCompetence.findFirst.mockResolvedValue(null);
    database.triageCatalogItem.findMany.mockResolvedValue([]);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.updateItem(
        MONTHLY,
        {
          type: "CONTABIL",
          field: "financial_transactions",
          status: "PENDING",
          justification: "missing",
        },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(database.triageMonthly.update).not.toHaveBeenCalled();
  });

  it("aceita chaves fiscais nulas na rotina contábil e ignora no update", async () => {
    const body = {
      type: "CONTABIL",
      field: "financial_transactions",
      status: "PENDING",
      note: "Aguardando extrato",
      delivery_method: null,
      state_site: null,
    };
    expect(documentItemSchema.safeParse(body).success).toBe(true);
    expect(documentItemSchema.safeParse({ ...body, state_site: "SP" }).success).toBe(false);
    expect(
      documentItemSchema.safeParse({
        ...body,
        type: "FISCAL",
        field: "nfce_documents",
        state_site: "SP",
      }).success,
    ).toBe(true);

    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      checklist: {},
      item_notes: {},
    });
    database.triageCompetence.findFirst.mockResolvedValue(null);
    database.triageCatalogItem.findMany.mockResolvedValue([]);
    database.triageMonthly.update.mockImplementation(async ({ data }) => ({
      id: MONTHLY,
      client_id: CLIENT,
      ...data,
    }));
    const service = createDocumentsService(database as never, audit());

    await service.updateItem(MONTHLY, body, auth);
    const notes = database.triageMonthly.update.mock.calls[0][0].data.item_notes;
    expect(notes?.financial_transactions).not.toHaveProperty("state_site");
    expect(notes?.financial_transactions).not.toHaveProperty("delivery_method");
  });

  it("envia timestamps obrigatórios nos creates e upserts físicos da triagem", async () => {
    const database = prisma();
    database.client.findFirst.mockResolvedValue({ id: CLIENT });
    database.triageConfig.findFirst.mockResolvedValue({ active_items: [] });
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageMonthly.create.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      competence: "2026-09",
      type: "CONTABIL",
      checklist: {},
      item_notes: {},
    });
    database.triageBankStatement.findFirst.mockResolvedValue(null);
    database.triageBankStatement.upsert.mockResolvedValue({ id: "statement-1" });
    database.triageClosing.findFirst.mockResolvedValue(null);
    database.triageClosing.upsert.mockResolvedValue({ id: "closing-1" });
    const closing = createClosingService(database as never, audit());
    const documents = createDocumentsService(database as never, audit());

    await documents.getOrCreateMonthly(
      { client_id: CLIENT, competence: "2026-09", type: "CONTABIL" },
      auth,
    );
    await documents.upsertStatement(
      { client_id: CLIENT, competence: "2026-09", bank_id: "bank-1", status: "PENDING" },
      auth,
    );
    await closing.update({ client_id: CLIENT, competence: "2026-09", status: "RECEIVED" }, auth);

    const monthlyData = database.triageMonthly.create.mock.calls[0]?.[0].data;
    const statementArgs = database.triageBankStatement.upsert.mock.calls[0]?.[0];
    const closingArgs = database.triageClosing.upsert.mock.calls[0]?.[0];
    expect(monthlyData).toEqual(
      expect.objectContaining({ created_at: expect.any(Date), updated_at: expect.any(Date) }),
    );
    expect(statementArgs.create).toEqual(
      expect.objectContaining({ created_at: expect.any(Date), updated_at: expect.any(Date) }),
    );
    expect(statementArgs.update).toEqual(expect.objectContaining({ updated_at: expect.any(Date) }));
    expect(closingArgs.create).toEqual(
      expect.objectContaining({ created_at: expect.any(Date), updated_at: expect.any(Date) }),
    );
    expect(closingArgs.update).toEqual(expect.objectContaining({ updated_at: expect.any(Date) }));
  });

  it("estabelece RLS antes de consultar a competência fiscal na mesma transação", async () => {
    const database = prisma();
    const events: string[] = [];
    database.triageCompetence.findFirst.mockImplementation(async () => {
      events.push("competence");
      return { configuration_snapshot: { configs: [{ type: "FISCAL", active_items: [] }] } };
    });
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageMonthly.create.mockResolvedValue({
      id: MONTHLY,
      client_id: CLIENT,
      competence: "2026-09",
      type: "FISCAL",
      checklist: {},
      item_notes: {},
    });
    database.$executeRaw.mockImplementation(async () => {
      events.push("rls");
    });
    const service = createDocumentsService(database as never, audit());

    await service.getOrCreateMonthly(
      { client_id: CLIENT, competence: "2026-09", type: "FISCAL" },
      { ...auth, modules: { fiscal: 2 } },
    );

    expect(database.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(events[0]).toBe("rls");
    expect(events.indexOf("rls")).toBeLessThan(events.indexOf("competence"));
  });

  it("autoriza escrita de controles pela permissão contábil efetiva, sem exigir claims.modules", async () => {
    const database = { controlContabil: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = createControlService(database as never, audit());

    await expect(
      service.completeAll(MONTHLY, { ...auth, permission: 3, modules: { contabil: 0 } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.completeAll(MONTHLY, { ...auth, permission: 1, modules: { contabil: 2 } }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
