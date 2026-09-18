import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  TRIAGE_DOCUMENT_FIELDS,
  TRIAGE_DOCUMENT_NOTE_MAX_LENGTH,
  TRIAGE_FISCAL_CHECKLIST_FIELDS,
  TRIAGE_FISCAL_FIELDS,
  TriageDocumentsService,
  type TriageDocumentsServicePrisma,
} from "../services/triageDocumentsService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const RESPONSIBLE_USER_ID = "c0000000-0000-4000-8000-000000000002";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const MONTHLY_ID = "d0000000-0000-4000-8000-000000000001";
const STATEMENT_ID = "e0000000-0000-4000-8000-000000000001";
const COMPETENCE = "2026-09";

const checklist = Object.fromEntries(TRIAGE_DOCUMENT_FIELDS.map((field) => [field, "PENDING"]));
const monthly = {
  id: MONTHLY_ID,
  client_id: CLIENT_ID,
  competence: COMPETENCE,
  type: "CONTABIL",
  checklist,
  organization_id: ORG_ID,
};

function createMockPrisma(): TriageDocumentsServicePrisma {
  const prisma = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: CLIENT_ID }) },
    triageConfig: { findFirst: vi.fn() },
    triageCompetence: { findFirst: vi.fn() },
    triageCatalogItem: {
      findMany: vi.fn(async (args: { where?: { code?: { in?: string[] } } }) =>
        (args.where?.code?.in ?? []).map((code) => ({ code })),
      ),
    },
    triageMonthly: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    triageResponsible: { findFirst: vi.fn() },
    triageBankStatement: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (transaction: TriageDocumentsServicePrisma) => unknown) =>
      callback(prisma),
    ),
  } as unknown as TriageDocumentsServicePrisma;

  return prisma;
}

function contabilEditor() {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    modules: { contabil: 2, triagem: 0 },
  };
}

function fiscalEditor() {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    modules: { fiscal: 2, triagem: 0 },
  };
}

describe("TriageDocumentsService", () => {
  it("expõe os 14 campos fiscais legados e lê métodos de entrega do catálogo", () => {
    expect(TRIAGE_FISCAL_FIELDS).toHaveLength(14);
    expect(TRIAGE_FISCAL_CHECKLIST_FIELDS).toHaveLength(13);
    expect(TRIAGE_FISCAL_FIELDS).toContain("billing_amount");
  });

  it("cria o mensal fiscal usando obrigatoriedade, prioridade e entrega do snapshot", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageCompetence.findFirst).mockResolvedValue({
      configuration_snapshot: {
        configs: [
          {
            type: "FISCAL",
            active_items: [
              {
                field: "nfce_documents",
                required: true,
                priority: "HIGH",
                delivery_method: "EMAIL",
              },
              {
                field: "sped_fiscal",
                required: false,
                priority: "LOW",
                delivery_method: "PORTAL",
              },
            ],
          },
        ],
      },
    } as never);
    vi.mocked(prisma.triageMonthly.create).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
      billing_amount: null,
    } as never);

    const result = await new TriageDocumentsService(prisma, {
      logUpdateIfChanged: vi.fn(),
    }).getOrCreateMonthly(
      { client_id: CLIENT_ID, competence: COMPETENCE, type: "FISCAL" },
      fiscalEditor(),
    );

    expect(prisma.triageMonthly.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "FISCAL",
        checklist: expect.objectContaining({
          nfce_documents: "PENDING",
          sped_fiscal: "NOT_APPLICABLE",
        }),
        item_notes: expect.objectContaining({
          nfce_documents: expect.objectContaining({
            priority: "HIGH",
            delivery_method: "EMAIL",
          }),
          sped_fiscal: expect.objectContaining({
            priority: "LOW",
            delivery_method: "PORTAL",
          }),
        }),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ type: "FISCAL" }));
  });

  it("rejeita justificativa ou método não cadastrado/arquivado", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findMany).mockResolvedValue([] as never);

    await expect(
      new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).updateItem(
        MONTHLY_ID,
        {
          field: "nfce_documents",
          type: "FISCAL",
          status: "ATTENTION",
          justification: "OLD_JUSTIFICATION",
        },
        fiscalEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).updateItem(
        MONTHLY_ID,
        {
          field: "nfce_documents",
          type: "FISCAL",
          status: "ATTENTION",
          delivery_method: "OLD_METHOD",
        },
        fiscalEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.triageMonthly.update).not.toHaveBeenCalled();
  });

  it("rejeita método de entrega fiscal não controlado antes da mutação", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageCatalogItem.findMany).mockResolvedValue([] as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateItem(
        MONTHLY_ID,
        {
          type: "FISCAL",
          field: "nfce_documents",
          status: "ATTENTION",
          delivery_method: "SMS",
        },
        fiscalEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.triageMonthly.update).not.toHaveBeenCalled();
  });

  it("atualiza estado fiscal, nota, revisão e entrega sem sair da organização", async () => {
    const prisma = createMockPrisma();
    const fiscalMonthly = {
      ...monthly,
      type: "FISCAL",
      checklist: { nfce_documents: "PENDING" },
      item_notes: { nfce_documents: { note: null, justification: null } },
    };
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(fiscalMonthly as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...fiscalMonthly,
      checklist: { nfce_documents: "UNDER_REVIEW" },
      item_notes: {
        nfce_documents: {
          note: "Arquivo parcial",
          justification: "Aguardando validação",
          delivery_method: "WHATSAPP",
        },
      },
    } as never);
    const audit = { logUpdateIfChanged: vi.fn() };

    const result = await new TriageDocumentsService(prisma, audit).updateItem(
      MONTHLY_ID,
      {
        type: "FISCAL",
        field: "nfce_documents",
        status: "UNDER_REVIEW",
        note: "Arquivo parcial",
        justification: "Aguardando validação",
        delivery_method: "WHATSAPP",
      },
      fiscalEditor(),
    );

    expect(result).toEqual(expect.objectContaining({ type: "FISCAL" }));
    expect(prisma.triageMonthly.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: MONTHLY_ID,
        organization_id: ORG_ID,
        type: "FISCAL",
      }),
    });
    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: expect.objectContaining({
        checklist: expect.objectContaining({ nfce_documents: "UNDER_REVIEW" }),
        item_notes: expect.objectContaining({
          nfce_documents: expect.objectContaining({ delivery_method: "WHATSAPP" }),
        }),
      }),
    });
  });

  it("salva o campo fiscal de faturamento sem convertê-lo em status", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
      billing_amount: null,
    } as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
      billing_amount: "12500,00",
    } as never);

    await new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).updateItem(
      MONTHLY_ID,
      { type: "FISCAL", field: "billing_amount", value: "12500,00" },
      fiscalEditor(),
    );

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: { billing_amount: "12500,00" },
    });
  });

  it("preserva observações ao alterar somente o método de entrega", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
      checklist: { nfce_documents: "PENDING" },
      item_notes: {
        nfce_documents: {
          note: "Arquivo recebido",
          justification: "Conferir no portal",
        },
      },
    } as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
    } as never);

    await new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).updateItem(
      MONTHLY_ID,
      {
        type: "FISCAL",
        field: "nfce_documents",
        status: "PENDING",
        delivery_method: "PORTAL",
      },
      fiscalEditor(),
    );

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: expect.objectContaining({
        item_notes: expect.objectContaining({
          nfce_documents: {
            note: "Arquivo recebido",
            justification: "Conferir no portal",
            delivery_method: "PORTAL",
          },
        }),
      }),
    });
  });

  it("remove o método de entrega quando recebe null explicitamente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
      checklist: { nfce_documents: "PENDING" },
      item_notes: {
        nfce_documents: {
          note: "Arquivo recebido",
          justification: null,
          delivery_method: "EMAIL",
        },
      },
    } as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...monthly,
      type: "FISCAL",
    } as never);

    await new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).updateItem(
      MONTHLY_ID,
      {
        type: "FISCAL",
        field: "nfce_documents",
        status: "PENDING",
        delivery_method: null,
      },
      fiscalEditor(),
    );

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: expect.objectContaining({
        item_notes: expect.objectContaining({
          nfce_documents: {
            note: "Arquivo recebido",
            justification: null,
            delivery_method: null,
          },
        }),
      }),
    });
  });

  it("mantém os dez itens operacionais e normaliza notas por item", async () => {
    expect(TRIAGE_DOCUMENT_FIELDS).toHaveLength(10);
    expect(TRIAGE_DOCUMENT_FIELDS).toContain("triaged_transactions");

    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue({
      ...monthly,
      checklist: { financial_transactions: "COMPLETED" },
      item_notes: {
        financial_transactions: { note: "Recebido", justification: null },
      },
    } as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await expect(
      service.getMonthly({ client_id: CLIENT_ID, competence: COMPETENCE }, ORG_ID),
    ).resolves.toEqual(
      expect.objectContaining({
        item_notes: expect.objectContaining({
          financial_transactions: { note: "Recebido", justification: null },
          triaged_transactions: { note: null, justification: null },
        }),
      }),
    );
  });

  it("atualiza estado, nota e justificativa do mesmo item", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(monthly as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...monthly,
      checklist: { ...checklist, triaged_transactions: "ATTENTION" },
      item_notes: {
        triaged_transactions: {
          note: "Documento parcial",
          justification: "Aguardando complemento do cliente",
        },
      },
    } as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await service.updateItem(
      MONTHLY_ID,
      {
        field: "triaged_transactions",
        status: "ATTENTION",
        note: "Documento parcial",
        justification: "Aguardando complemento do cliente",
      },
      contabilEditor(),
    );

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: {
        checklist: expect.objectContaining({ triaged_transactions: "ATTENTION" }),
        item_notes: expect.objectContaining({
          triaged_transactions: {
            note: "Documento parcial",
            justification: "Aguardando complemento do cliente",
          },
        }),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("rejeita observações acima do limite antes de tocar no banco", async () => {
    const prisma = createMockPrisma();
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateItem(
        MONTHLY_ID,
        {
          field: "triaged_transactions",
          status: "ATTENTION",
          note: "x".repeat(TRIAGE_DOCUMENT_NOTE_MAX_LENGTH + 1),
        },
        contabilEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserva atualizações distintas quando itens são alterados em paralelo", async () => {
    const prisma = createMockPrisma();
    const stored = {
      ...monthly,
      checklist: { ...checklist },
      item_notes: {},
    };
    let transactionTail = Promise.resolve();

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(prisma);
      } finally {
        release();
      }
    });
    vi.mocked(prisma.triageMonthly.findFirst).mockImplementation((async () => ({
      ...stored,
      checklist: { ...stored.checklist },
      item_notes: structuredClone(stored.item_notes),
    })) as never);
    vi.mocked(prisma.triageMonthly.update).mockImplementation((async ({
      data,
    }: {
      data: { checklist?: unknown; item_notes?: unknown };
    }) => {
      stored.checklist = data.checklist as typeof stored.checklist;
      stored.item_notes = (data.item_notes ?? stored.item_notes) as typeof stored.item_notes;
      return {
        ...stored,
        checklist: { ...stored.checklist },
        item_notes: structuredClone(stored.item_notes),
      };
    }) as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await Promise.all([
      service.updateItem(
        MONTHLY_ID,
        {
          field: "financial_transactions",
          status: "COMPLETED",
          note: "Movimentações conferidas",
        },
        contabilEditor(),
      ),
      service.updateItem(
        MONTHLY_ID,
        {
          field: "triaged_transactions",
          status: "ATTENTION",
          justification: "Aguardando validação complementar",
        },
        contabilEditor(),
      ),
    ]);

    expect(stored.checklist).toEqual(
      expect.objectContaining({
        financial_transactions: "COMPLETED",
        triaged_transactions: "ATTENTION",
      }),
    );
    expect(stored.item_notes).toEqual(
      expect.objectContaining({
        financial_transactions: expect.objectContaining({ note: "Movimentações conferidas" }),
        triaged_transactions: expect.objectContaining({
          justification: "Aguardando validação complementar",
        }),
      }),
    );
  });

  it("cria mensal idempotente usando PENDING para item ativo e NOT_APPLICABLE para ausente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageConfig.findFirst).mockResolvedValue({
      active_items: ["financial_transactions", "card_statements"],
    } as never);
    vi.mocked(prisma.triageMonthly.create).mockResolvedValue(monthly as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await service.getOrCreateMonthly(
      { client_id: CLIENT_ID, competence: COMPETENCE },
      contabilEditor(),
    );

    expect(prisma.triageMonthly.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        organization_id: ORG_ID,
        type: "CONTABIL",
        checklist: expect.objectContaining({
          financial_transactions: "PENDING",
          card_statements: "PENDING",
          inventory_control: "NOT_APPLICABLE",
        }),
      }),
    });
  });

  it("não retorna mensal arquivado no fallback de uma corrida de criação", async () => {
    const prisma = createMockPrisma();
    const archived = {
      ...monthly,
      archived_at: new Date("2026-09-01T00:00:00.000Z"),
    };
    vi.mocked(prisma.triageMonthly.findFirst).mockImplementation((async (args: unknown) => {
      const where = args && typeof args === "object" && "where" in args ? args.where : undefined;
      const archivedAt =
        where && typeof where === "object" && "archived_at" in where
          ? where.archived_at
          : undefined;
      return (archivedAt === null ? null : archived) as never;
    }) as never);
    vi.mocked(prisma.triageConfig.findFirst).mockResolvedValue({
      active_items: [],
    } as never);
    vi.mocked(prisma.triageMonthly.create).mockRejectedValue({ code: "P2002" });

    await expect(
      new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).getOrCreateMonthly(
        { client_id: CLIENT_ID, competence: COMPETENCE },
        contabilEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.triageMonthly.findFirst).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ archived_at: null }),
    });
  });

  it("retorna o mensal existente da organização sem criar novamente", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(monthly as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    const result = await service.getOrCreateMonthly(
      { client_id: CLIENT_ID, competence: COMPETENCE },
      contabilEditor(),
    );

    expect(result.id).toBe(MONTHLY_ID);
    expect(prisma.triageMonthly.create).not.toHaveBeenCalled();
    expect(prisma.triageMonthly.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ organization_id: ORG_ID, client_id: CLIENT_ID }),
    });
  });

  it("calcula percentual sem NOT_PRESENT e NOT_APPLICABLE no denominador", async () => {
    const prisma = createMockPrisma();
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    expect(
      service.getSummary({
        financial_transactions: "COMPLETED",
        inventory_control: "PENDING",
        accounts_payable_report: "ATTENTION",
        accounts_receivable_report: "NOT_PRESENT",
        card_statements: "NOT_APPLICABLE",
      }),
    ).toEqual(expect.objectContaining({ applicable: 3, completed: 1, percentage: 33 }));
  });

  it("altera um item permitido e audita os valores antes e depois", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(monthly as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue({
      ...monthly,
      checklist: { ...checklist, card_statements: "COMPLETED" },
    } as never);
    const audit = { logUpdateIfChanged: vi.fn() };
    const service = new TriageDocumentsService(prisma, audit);

    await service.updateItem(
      MONTHLY_ID,
      { field: "card_statements", status: "COMPLETED" },
      contabilEditor(),
    );

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: { checklist: expect.objectContaining({ card_statements: "COMPLETED" }) },
    });
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        referring: "triagem.monthly",
        referringId: MONTHLY_ID,
        oldData: monthly,
      }),
    );
  });

  it("marca todos somente no mensal aberto e preserva NOT_APPLICABLE", async () => {
    const prisma = createMockPrisma();
    const record = {
      ...monthly,
      checklist: { ...checklist, bank_investments: "NOT_APPLICABLE" },
    };
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(record as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue(record as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await service.updateAll(MONTHLY_ID, { status: "COMPLETED" }, contabilEditor());

    expect(prisma.triageMonthly.update).toHaveBeenCalledWith({
      where: { id: MONTHLY_ID },
      data: {
        checklist: expect.objectContaining({
          financial_transactions: "COMPLETED",
          bank_investments: "NOT_APPLICABLE",
        }),
      },
    });
  });

  it("permite a escrita ao responsável Triagem atribuído e bloqueia outro viewer", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(monthly as never);
    vi.mocked(prisma.triageResponsible.findFirst).mockResolvedValue({ id: "responsible" } as never);
    vi.mocked(prisma.triageMonthly.update).mockResolvedValue(monthly as never);
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateItem(
        MONTHLY_ID,
        { field: "inventory_control", status: "ATTENTION" },
        {
          userId: RESPONSIBLE_USER_ID,
          organizationId: ORG_ID,
          modules: { contabil: 0, triagem: 1 },
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ id: MONTHLY_ID }));

    vi.mocked(prisma.triageResponsible.findFirst).mockResolvedValue(null);
    await expect(
      service.updateItem(
        MONTHLY_ID,
        { field: "inventory_control", status: "ATTENTION" },
        { userId: USER_ID, organizationId: ORG_ID, modules: { contabil: 1, triagem: 1 } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("isola mensal e extratos por organização e permite bancos distintos", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.triageMonthly.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageBankStatement.upsert).mockResolvedValue({ id: STATEMENT_ID } as never);
    const audit = { logUpdateIfChanged: vi.fn() };
    const service = new TriageDocumentsService(prisma, audit);

    await service.upsertStatement(
      { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "001", status: "PENDING" },
      contabilEditor(),
    );
    await service.upsertStatement(
      { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "341", status: "COMPLETED" },
      contabilEditor(),
    );

    expect(prisma.triageBankStatement.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          organization_id_client_id_competence_bank_id: {
            organization_id: ORG_ID,
            client_id: CLIENT_ID,
            competence: COMPETENCE,
            bank_id: "001",
          },
        },
      }),
    );
    expect(prisma.triageBankStatement.upsert).toHaveBeenCalledTimes(2);
    await expect(
      service.getMonthly({ client_id: CLIENT_ID, competence: COMPETENCE }, OTHER_ORG_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("não cria marcador bancário para cliente de outra organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null);

    await expect(
      new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).upsertStatement(
        { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "001", status: "PENDING" },
        contabilEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORG_ID },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("não arquiva marcador bancário para cliente de outra organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue(null);

    await expect(
      new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() }).archiveStatement(
        { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "001" },
        contabilEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORG_ID },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("arquiva somente o marcador ativo da organização e audita a operação", async () => {
    const prisma = createMockPrisma();
    const active = {
      id: STATEMENT_ID,
      client_id: CLIENT_ID,
      competence: COMPETENCE,
      bank_id: "001",
      status: "COMPLETED",
      archived_at: null,
      organization_id: ORG_ID,
    };
    const archived = { ...active, archived_at: new Date("2026-09-17T10:00:00.000Z") };
    vi.mocked(prisma.triageBankStatement.findFirst).mockResolvedValue(active as never);
    vi.mocked(prisma.triageBankStatement.update).mockResolvedValue(archived as never);
    const audit = { logUpdateIfChanged: vi.fn() };

    const result = await new TriageDocumentsService(prisma, audit).archiveStatement(
      { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "001" },
      contabilEditor(),
    );

    expect(result).toEqual(archived);
    expect(prisma.triageBankStatement.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: ORG_ID,
        client_id: CLIENT_ID,
        competence: COMPETENCE,
        bank_id: "001",
        archived_at: null,
      },
    });
    expect(prisma.triageBankStatement.update).toHaveBeenCalledWith({
      where: { id: STATEMENT_ID },
      data: { archived_at: expect.any(Date) },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Arquivar marcador de extrato bancário",
        referring: "triagem.bank_statements",
        oldData: active,
        updatedData: archived,
      }),
    );
  });

  it("não tenta arquivar marcador bancário sem identificador", async () => {
    const prisma = createMockPrisma();
    const service = new TriageDocumentsService(prisma, { logUpdateIfChanged: vi.fn() });

    await expect(
      service.archiveStatement(
        { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "   " },
        contabilEditor(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.triageBankStatement.findFirst).not.toHaveBeenCalled();
  });

  it("reabre um marcador arquivado quando uma nova pendência chega para a mesma competência", async () => {
    const prisma = createMockPrisma();
    const archived = {
      id: STATEMENT_ID,
      client_id: CLIENT_ID,
      competence: COMPETENCE,
      bank_id: "001",
      status: "COMPLETED",
      archived_at: new Date("2026-09-17T10:00:00.000Z"),
      organization_id: ORG_ID,
    };
    vi.mocked(prisma.triageBankStatement.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.triageBankStatement.upsert).mockResolvedValue({
      ...archived,
      archived_at: null,
      status: "PENDING",
    } as never);

    const result = await new TriageDocumentsService(prisma, {
      logUpdateIfChanged: vi.fn(),
    }).upsertStatement(
      { client_id: CLIENT_ID, competence: COMPETENCE, bank_id: "001", status: "PENDING" },
      contabilEditor(),
    );

    expect(result).toEqual(expect.objectContaining({ status: "PENDING", archived_at: null }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.triageBankStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { status: "PENDING", archived_at: null },
      }),
    );
  });
});
