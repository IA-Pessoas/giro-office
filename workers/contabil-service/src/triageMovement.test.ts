import { describe, expect, it, vi } from "vitest";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MONTHLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const auth = { userId: USER, organizationId: ORG, modules: { contabil: 2 } };

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT }) },
    user: { findFirst: vi.fn() },
    triageResponsible: { findFirst: vi.fn() },
    triageConfig: { findFirst: vi.fn(), upsert: vi.fn() },
    triageMonthly: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageCatalogItem: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    triageCompetenceCatalogSnapshot: { findFirst: vi.fn(), findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  database.triageMonthly.create.mockImplementation(async ({ data }) => ({ id: MONTHLY, ...data }));
  database.triageMonthly.update.mockImplementation(async ({ data }) => ({
    id: MONTHLY,
    client_id: CLIENT,
    competence: "2026-09",
    type: "CONTABIL",
    ...data,
  }));
  return database;
}

const start = (database: ReturnType<typeof prisma>) =>
  createDocumentsService(database as never, audit()).getOrCreateMonthly(
    { client_id: CLIENT, competence: "2026-09", type: "CONTABIL" },
    auth,
  );

function monthly(checklist: Record<string, unknown>, item_notes: Record<string, unknown> = {}) {
  return {
    id: MONTHLY,
    client_id: CLIENT,
    competence: "2026-09",
    type: "CONTABIL",
    organization_id: ORG,
    checklist,
    item_notes,
  };
}

describe("movimento e estados do checklist Contábil (#1691)", () => {
  it("inicia a competência pelo movimento padrão congelado no snapshot, não pelo atual", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue({
      configuration_snapshot: {
        configs: [{ type: "CONTABIL", active_items: ["financial_transactions"] }],
      },
    });
    database.triageConfig.findFirst.mockResolvedValue({ active_items: ["bank_reconciliation"] });

    const result = await start(database);

    expect(database.triageConfig.findFirst).not.toHaveBeenCalled();
    expect(database.triageCompetence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ client_id: CLIENT, organization_id: ORG }),
      }),
    );
    expect(result.checklist).toMatchObject({
      financial_transactions: "PENDING",
      bank_reconciliation: "NOT_APPLICABLE",
    });
    expect(result.item_notes).toMatchObject({
      financial_transactions: { required: true },
      bank_reconciliation: { required: false },
    });
  });

  it("sem competência aberta usa o movimento padrão atual do cliente na organização", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue(null);
    database.triageConfig.findFirst.mockResolvedValue({ active_items: ["bank_reconciliation"] });

    const result = await start(database);

    expect(database.triageConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { client_id: CLIENT, organization_id: ORG, type: "CONTABIL" },
      }),
    );
    expect(result.checklist).toMatchObject({
      bank_reconciliation: "PENDING",
      financial_transactions: "NOT_APPLICABLE",
    });
    expect(result.item_notes).toMatchObject({ financial_transactions: { required: false } });
  });

  it("cliente sem movimento padrão mantém os itens editáveis, sem desativar nenhum", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue(null);
    database.triageConfig.findFirst.mockResolvedValue(null);

    const result = await start(database);

    expect(result.checklist.financial_transactions).toBe("NOT_APPLICABLE");
    expect(result.item_notes.financial_transactions).not.toHaveProperty("required");
  });

  it("lê os estados do legado com o mesmo significado", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(
      monthly({
        financial_transactions: "",
        triaged_transactions: "nao possui",
        inventory_control: "atenção",
        accounts_payable_report: "concluido",
      }),
    );
    database.triageCatalogItem.findMany.mockResolvedValue([]);

    const result = await createDocumentsService(database as never, audit()).updateItem(
      MONTHLY,
      { type: "CONTABIL", field: "card_statements", status: "PENDING" },
      auth,
    );

    expect(result.checklist).toMatchObject({
      financial_transactions: "PENDING",
      triaged_transactions: "NOT_PRESENT",
      inventory_control: "ATTENTION",
      accounts_payable_report: "COMPLETED",
      card_statements: "PENDING",
      bank_reconciliation: "NOT_APPLICABLE",
    });
  });

  it("operação em lote ignora itens desativados e não aplicáveis", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(
      monthly(
        {
          financial_transactions: "PENDING",
          triaged_transactions: "ATTENTION",
          inventory_control: "NOT_APPLICABLE",
          bank_reconciliation: "PENDING",
        },
        { bank_reconciliation: { required: false } },
      ),
    );

    const result = await createDocumentsService(database as never, audit()).updateAll(
      MONTHLY,
      { type: "CONTABIL", status: "COMPLETED" },
      auth,
    );

    expect(result.checklist).toMatchObject({
      financial_transactions: "COMPLETED",
      triaged_transactions: "COMPLETED",
      inventory_control: "NOT_APPLICABLE",
      bank_reconciliation: "PENDING",
    });
  });

  it("recusa alterar item desativado no movimento padrão", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(
      monthly(
        { bank_reconciliation: "NOT_APPLICABLE" },
        { bank_reconciliation: { required: false } },
      ),
    );

    await expect(
      createDocumentsService(database as never, audit()).updateItem(
        MONTHLY,
        { type: "CONTABIL", field: "bank_reconciliation", status: "PENDING" },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(database.triageMonthly.update).not.toHaveBeenCalled();
  });

  it("atribui envio de movimento, observação, datas, responsável e justificativa", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(monthly({}));
    database.user.findFirst.mockResolvedValue({ id: OTHER_USER });
    database.triageCatalogItem.findMany.mockResolvedValue([{ code: "NO_MOVEMENT" }]);
    database.triageCompetenceCatalogSnapshot.findMany.mockResolvedValue([]);

    const result = await createDocumentsService(database as never, audit()).updateMonthly(
      MONTHLY,
      {
        type: "CONTABIL",
        triad_moviment: true,
        notes: "Extrato chegou por e-mail",
        justification: "NO_MOVEMENT",
        responsible_id: OTHER_USER,
        download_date: "2026-10-03",
        settlement_date: null,
      },
      auth,
    );

    expect(database.triageMonthly.findFirst).toHaveBeenCalledWith({
      where: { id: MONTHLY, organization_id: ORG, type: "CONTABIL", archived_at: null },
    });
    expect(database.user.findFirst).toHaveBeenCalledWith({
      where: { id: OTHER_USER, organization_id: ORG },
      select: { id: true },
    });
    expect(database.triageMonthly.update.mock.calls[0][0].data).toMatchObject({
      triad_moviment: true,
      notes: "Extrato chegou por e-mail",
      justification: "NO_MOVEMENT",
      responsible_id: OTHER_USER,
      download_date: new Date("2026-10-03T00:00:00.000Z"),
      settlement_date: null,
    });
    expect(result).toMatchObject({ triad_moviment: true, responsible_id: OTHER_USER });
  });

  it("recusa responsável de outra organização e rotina de outra organização", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValueOnce(monthly({}));
    database.user.findFirst.mockResolvedValue(null);
    const service = createDocumentsService(database as never, audit());

    await expect(
      service.updateMonthly(MONTHLY, { type: "CONTABIL", responsible_id: OTHER_USER }, auth),
    ).rejects.toMatchObject({ statusCode: 400 });
    database.triageMonthly.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateMonthly(MONTHLY, { type: "CONTABIL", notes: "x" }, auth),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.triageMonthly.update).not.toHaveBeenCalled();
  });

  it("configura o movimento padrão do cliente da organização", async () => {
    const database = prisma();
    database.triageConfig.upsert.mockImplementation(async ({ create }) => create);
    const service = createDocumentsService(database as never, audit());

    const saved = await service.saveConfig(
      {
        client_id: CLIENT,
        type: "CONTABIL",
        active_items: ["bank_reconciliation", "financial_transactions", "bank_reconciliation"],
      },
      auth,
    );

    expect(database.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT, organization_id: ORG },
      select: { id: true },
    });
    const args = database.triageConfig.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      organization_id_client_id_type: { organization_id: ORG, client_id: CLIENT, type: "CONTABIL" },
    });
    expect(args.update.active_items).toEqual(["financial_transactions", "bank_reconciliation"]);
    expect(saved).toEqual({
      client_id: CLIENT,
      type: "CONTABIL",
      active_items: ["financial_transactions", "bank_reconciliation"],
    });

    database.client.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.saveConfig({ client_id: CLIENT, type: "CONTABIL", active_items: [] }, auth),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lê o movimento padrão vazio quando o cliente ainda não configurou", async () => {
    const database = prisma();
    database.triageConfig.findFirst.mockResolvedValue(null);

    const config = await createDocumentsService(database as never, audit()).getConfig(
      { client_id: CLIENT, type: "CONTABIL" },
      auth,
    );

    expect(database.triageConfig.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT, organization_id: ORG, type: "CONTABIL" },
      select: { active_items: true },
    });
    expect(config).toEqual({ client_id: CLIENT, type: "CONTABIL", active_items: [] });
  });

  it("recusa configurar sem permissão de escrita no Contábil", async () => {
    const database = prisma();
    database.triageResponsible.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentsService(database as never, audit()).saveConfig(
        { client_id: CLIENT, type: "CONTABIL", active_items: [] },
        { ...auth, modules: { contabil: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(database.triageConfig.upsert).not.toHaveBeenCalled();
  });
});
