import { describe, expect, it, vi } from "vitest";
import { triageConfigBodySchema } from "./schemas.js";
import { createDocumentsService } from "./services.js";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MONTHLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const auth = { userId: USER, organizationId: ORG, modules: { fiscal: 2 } };

function audit() {
  return { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
}

function prisma() {
  const database = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT }) },
    triageResponsible: { findFirst: vi.fn().mockResolvedValue(null) },
    triageConfig: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    triageMonthly: { findFirst: vi.fn(), create: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageCatalogItem: { findMany: vi.fn().mockResolvedValue([]) },
    triageCompetenceCatalogSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  );
  database.triageConfig.upsert.mockImplementation(async ({ create }) => create);
  database.triageMonthly.create.mockImplementation(async ({ data }) => ({ id: MONTHLY, ...data }));
  return database;
}

describe("documentos fiscais especiais (#1693)", () => {
  it("configura só os documentos especiais e preserva o resto da configuração fiscal", async () => {
    const database = prisma();
    database.triageConfig.findFirst.mockResolvedValue({
      active_items: ["sped_fiscal", { field: "inbound_report", required: true, priority: "HIGH" }],
    });
    const log = audit();

    const saved = await createDocumentsService(database as never, log).saveConfig(
      { client_id: CLIENT, type: "FISCAL", active_items: ["model_21_invoice", "nfce_documents"] },
      auth,
    );

    const args = database.triageConfig.upsert.mock.calls[0][0];
    expect(args.where).toEqual({
      organization_id_client_id_type: { organization_id: ORG, client_id: CLIENT, type: "FISCAL" },
    });
    expect(args.update.active_items).toEqual([
      { field: "inbound_report", required: true, priority: "HIGH" },
      "nfce_documents",
      "model_21_invoice",
    ]);
    expect(saved).toMatchObject({
      type: "FISCAL",
      active_items: ["nfce_documents", "model_21_invoice"],
    });
    expect(log.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Configurar documentos fiscais especiais",
        oldData: { active_items: ["sped_fiscal"] },
        updatedData: { active_items: ["nfce_documents", "model_21_invoice"] },
      }),
    );
  });

  it("mantém prioridade e meio de envio do documento que segue selecionado", async () => {
    const database = prisma();
    database.triageConfig.findFirst.mockResolvedValue({
      active_items: [{ field: "sped_fiscal", required: false, priority: "HIGH" }],
    });

    await createDocumentsService(database as never, audit()).saveConfig(
      { client_id: CLIENT, type: "FISCAL", active_items: ["sped_fiscal", "billing_amount"] },
      auth,
    );

    expect(database.triageConfig.upsert.mock.calls[0][0].update.active_items).toEqual([
      { field: "sped_fiscal", required: true, priority: "HIGH" },
      "billing_amount",
    ]);
  });

  it("faturamento fora da configuração fica não aplicável na competência", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue({
      configuration_snapshot: { configs: [{ type: "FISCAL", active_items: ["sped_fiscal"] }] },
    });

    const result = await createDocumentsService(database as never, audit()).getOrCreateMonthly(
      { client_id: CLIENT, competence: "2026-09", type: "FISCAL" },
      auth,
    );

    expect(result.item_notes).toMatchObject({
      billing_amount: { required: false },
      sped_fiscal: { required: true },
    });
  });

  it("lê os especiais da organização e exige acesso ao Fiscal", async () => {
    const database = prisma();
    database.triageConfig.findFirst.mockResolvedValue({
      active_items: ["cte_as_issuer", "inbound_report", { field: "sped_fiscal", required: false }],
    });
    const service = createDocumentsService(database as never, audit());

    const config = await service.getConfig({ client_id: CLIENT, type: "FISCAL" }, auth);

    expect(database.triageConfig.findFirst).toHaveBeenCalledWith({
      where: { client_id: CLIENT, organization_id: ORG, type: "FISCAL" },
      select: { active_items: true },
    });
    expect(config).toMatchObject({ configured: true, active_items: ["cte_as_issuer"] });
    await expect(
      service.getConfig({ client_id: CLIENT, type: "FISCAL" }, { ...auth, modules: {} }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("recusa cliente de outra organização ao configurar", async () => {
    const database = prisma();
    database.client.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentsService(database as never, audit()).saveConfig(
        { client_id: CLIENT, type: "FISCAL", active_items: ["sped_fiscal"] },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(database.triageConfig.upsert).not.toHaveBeenCalled();
  });

  it("valida os itens configuráveis por rotina", () => {
    const fiscal = { client_id: CLIENT, type: "FISCAL" };
    expect(
      triageConfigBodySchema.safeParse({ ...fiscal, active_items: ["sped_contributions"] }).success,
    ).toBe(true);
    expect(
      triageConfigBodySchema.safeParse({ ...fiscal, active_items: ["billing_amount"] }).success,
    ).toBe(true);
    expect(
      triageConfigBodySchema.safeParse({ ...fiscal, active_items: ["inbound_report"] }).success,
    ).toBe(false);
    expect(
      triageConfigBodySchema.safeParse({ ...fiscal, active_items: ["bank_reconciliation"] })
        .success,
    ).toBe(false);
    expect(
      triageConfigBodySchema.safeParse({ client_id: CLIENT, active_items: ["sped_fiscal"] })
        .success,
    ).toBe(false);
  });

  it("competência fiscal inicia especiais configurados pendentes e os demais inaplicáveis", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue({
      configuration_snapshot: {
        configs: [{ type: "FISCAL", active_items: ["sped_fiscal", "services_provided_as_mei"] }],
      },
    });

    const result = await createDocumentsService(database as never, audit()).getOrCreateMonthly(
      { client_id: CLIENT, competence: "2026-09", type: "FISCAL" },
      auth,
    );

    expect(database.triageCompetence.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_id: CLIENT,
          competence: "2026-09",
          organization_id: ORG,
        }),
      }),
    );
    expect(database.triageConfig.findFirst).not.toHaveBeenCalled();
    expect(result.checklist).toMatchObject({
      sped_fiscal: "PENDING",
      services_provided_as_mei: "PENDING",
      nfce_documents: "NOT_APPLICABLE",
      model_21_invoice: "NOT_APPLICABLE",
      cte_as_issuer: "NOT_APPLICABLE",
    });
  });

  it("sem competência aberta a rotina fiscal não inicia", async () => {
    const database = prisma();
    database.triageMonthly.findFirst.mockResolvedValue(null);
    database.triageCompetence.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentsService(database as never, audit()).getOrCreateMonthly(
        { client_id: CLIENT, competence: "2026-09", type: "FISCAL" },
        auth,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
