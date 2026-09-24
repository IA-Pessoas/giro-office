import { describe, expect, it, vi } from "vitest";
import { createClosingService, createControlService, createDocumentsService } from "./services.js";

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
