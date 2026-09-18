import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import {
  TRIAGE_DOCUMENT_FIELDS,
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
  return {
    triageConfig: { findFirst: vi.fn() },
    triageMonthly: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    triageResponsible: { findFirst: vi.fn() },
    triageBankStatement: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  } as unknown as TriageDocumentsServicePrisma;
}

function contabilEditor() {
  return {
    userId: USER_ID,
    organizationId: ORG_ID,
    modules: { contabil: 2, triagem: 0 },
  };
}

describe("TriageDocumentsService", () => {
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
});
