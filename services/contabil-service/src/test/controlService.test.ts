import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { ControlService, type ControlServicePrisma } from "../services/controlService.js";

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const CONTROL_ID = "d0000000-0000-4000-8000-000000000001";

const baseRow = {
  id: CONTROL_ID,
  competence: "2024-01",
  client_id: CLIENT_ID,
  organization_id: ORG_ID,
  archived_at: null,
  regenerate_accounting_entries: false,
  check_summary_by_accumulator: false,
  post_accounting_transaction: false,
  import_bank_statements: false,
  reconcile_bank_statements: false,
  reconcile_vendors: false,
  integrate_taxes: false,
  settle_federal_taxes_via_ecac: false,
  settle_state_taxes_via_sefaz_ba: false,
  integrate_payroll: false,
  suspense_accounts: false,
  check_overdrawn_accounts: false,
  general_account_reconciliation: false,
  check_loan_and_interest_accounts: false,
  monthly_closing: false,
  reconcile_icms_pis_cofins: false,
  depreciation: false,
  notes: "",
};

function createMockPrisma(): ControlServicePrisma {
  return {
    client: {
      findFirst: vi.fn().mockResolvedValue({ contabil: null }),
      findMany: vi.fn(),
    },
    controlContabil: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    triageMonthly: { updateMany: vi.fn() },
    triageBankStatement: { updateMany: vi.fn() },
    triageClosing: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as ControlServicePrisma;
}

describe("ControlService", () => {
  it("cria as doze competências de um ano sem duplicar as já existentes", async () => {
    const prisma = createMockPrisma();
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ id: CLIENT_ID } as never);
    vi.mocked(prisma.controlContabil.findMany).mockResolvedValue([
      { ...baseRow, competence: "2024-01" },
    ] as never);
    vi.mocked(prisma.controlContabil.createMany).mockResolvedValue({ count: 11 } as never);
    const service = new ControlService(prisma, audit);

    const result = await service.createYear({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 2,
      clientId: CLIENT_ID,
      year: 2024,
      confirmed: true,
    });

    expect(result).toEqual({
      competences: [
        "2024-01",
        "2024-02",
        "2024-03",
        "2024-04",
        "2024-05",
        "2024-06",
        "2024-07",
        "2024-08",
        "2024-09",
        "2024-10",
        "2024-11",
        "2024-12",
      ],
      created: 11,
      existing: 1,
    });
    expect(prisma.controlContabil.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([expect.objectContaining({ competence: "2024-02" })]),
      }),
    );
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Criar controles contábeis anuais",
        referring: "contabil.control.batch",
      }),
    );
  });

  it("list retorna uma linha ordenada por razão social, inclusive sem controle mensal", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findMany).mockResolvedValue([
      {
        id: "b0000000-0000-4000-8000-000000000003",
        name: "Cliente C",
        company_name: null,
        controlContabil: [],
      },
      {
        id: "b0000000-0000-4000-8000-000000000002",
        name: "Cliente B",
        company_name: "Beta Contábil Ltda.",
        controlContabil: [{ ...baseRow, client_id: "b0000000-0000-4000-8000-000000000002" }],
      },
      {
        id: "b0000000-0000-4000-8000-000000000001",
        name: "Cliente A",
        company_name: "Alfa Contábil Ltda.",
        controlContabil: [],
      },
    ] as never);
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(service.list("2024-01", ORG_ID)).resolves.toEqual({
      competence: "2024-01",
      items: [
        {
          client_id: "b0000000-0000-4000-8000-000000000001",
          legal_name: "Alfa Contábil Ltda.",
          control: null,
          closing: {
            client_id: "b0000000-0000-4000-8000-000000000001",
            competence: "2024-01",
            status: "NOT_RECEIVED",
            archived_at: null,
          },
        },
        {
          client_id: "b0000000-0000-4000-8000-000000000002",
          legal_name: "Beta Contábil Ltda.",
          control: { ...baseRow, client_id: "b0000000-0000-4000-8000-000000000002" },
          closing: {
            client_id: "b0000000-0000-4000-8000-000000000002",
            competence: "2024-01",
            status: "NOT_RECEIVED",
            archived_at: null,
          },
        },
        {
          client_id: "b0000000-0000-4000-8000-000000000003",
          legal_name: "Cliente C",
          control: null,
          closing: {
            client_id: "b0000000-0000-4000-8000-000000000003",
            competence: "2024-01",
            status: "NOT_RECEIVED",
            archived_at: null,
          },
        },
      ],
    });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: ORG_ID,
          AND: [
            { OR: [{ contabil: true }, { contabil: null }] },
            {
              OR: [
                { competence_entry: null },
                { competence_entry: { lte: new Date("2024-01-31T23:59:59.999Z") } },
              ],
            },
            {
              OR: [
                { competence_output: null },
                { competence_output: { gte: new Date("2024-01-01T00:00:00.000Z") } },
              ],
            },
          ],
        }),
      }),
    );
    expect(prisma.controlContabil.create).not.toHaveBeenCalled();
    expect(prisma.controlContabil.update).not.toHaveBeenCalled();
  });

  it("bloqueia mês e ano com a mesma mensagem quando o serviço contábil não é contratado (#1323)", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.client.findFirst).mockResolvedValue({ contabil: false } as never);
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });
    const identity = {
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 2,
      clientId: CLIENT_ID,
    };
    const expected = {
      statusCode: 400,
      message: "Serviço contábil não contratado para este cliente.",
    };

    await expect(service.create({ ...identity, competence: "2024-01" })).rejects.toMatchObject(
      expected,
    );
    await expect(
      service.createYear({ ...identity, year: 2024, confirmed: true }),
    ).rejects.toMatchObject(expected);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, organization_id: ORG_ID },
      select: { contabil: true },
    });
  });

  it("create retorna existente sem auditar quando já há registro", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(baseRow);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new ControlService(prisma, audit);

    const result = await service.create({
      userId: USER_ID,
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      competence: "2024-01",
    });

    expect(result.created).toBe(false);
    expect(result.control).toEqual(baseRow);
    expect(prisma.controlContabil.create).not.toHaveBeenCalled();
    expect(audit.createLog).not.toHaveBeenCalled();
  });

  it("create restaura a competência arquivada em vez de tentar inseri-la novamente", async () => {
    const prisma = createMockPrisma();
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    vi.mocked(prisma.controlContabil.findFirst)
      .mockResolvedValueOnce({ ...baseRow, archived_at: new Date("2024-02-01") } as never)
      .mockResolvedValueOnce(baseRow as never);
    vi.mocked(prisma.controlContabil.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.triageMonthly.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.triageBankStatement.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.triageClosing.updateMany).mockResolvedValue({ count: 0 } as never);
    const transaction = prisma.$transaction as unknown as {
      mockImplementation: (fn: (operations: Promise<unknown>[]) => Promise<unknown[]>) => void;
    };
    transaction.mockImplementation(async (operations) => Promise.all(operations));
    const service = new ControlService(prisma, audit);

    await expect(
      service.create({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 2,
        clientId: CLIENT_ID,
        competence: "2024-01",
      }),
    ).resolves.toEqual({ control: baseRow, created: false });

    expect(prisma.controlContabil.create).not.toHaveBeenCalled();
    expect(prisma.controlContabil.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archived_at: null } }),
    );
  });

  it("create persiste, audita e marca created=true", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.controlContabil.create).mockResolvedValue(baseRow);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new ControlService(prisma, audit);

    const result = await service.create({
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 1,
      clientId: CLIENT_ID,
      competence: "2024-01",
    });

    expect(result.created).toBe(true);
    expect(result.control).toEqual(baseRow);
    expect(prisma.controlContabil.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_id: CLIENT_ID,
        competence: "2024-01",
        organization_id: ORG_ID,
        notes: "",
      }),
    });
    expect(audit.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        permission: 1,
        referring: "contabil.control",
        referringId: CONTROL_ID,
      }),
    );
  });

  it("detail lança 404 quando não encontra", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(null);
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(service.detail(CLIENT_ID, "2024-01", ORG_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("detail retorna registro", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(baseRow);
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    const row = await service.detail(CLIENT_ID, "2024-01", ORG_ID);
    expect(row).toEqual(baseRow);
  });

  it("updateField rejeita campo fora da whitelist", async () => {
    const prisma = createMockPrisma();
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateField(CONTROL_ID, "campo_invalido", true, {
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.controlContabil.findFirst).not.toHaveBeenCalled();
  });

  it("updateField rejeita tipo incorreto para boolean", async () => {
    const prisma = createMockPrisma();
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateField(CONTROL_ID, "depreciation", "sim" as unknown as boolean, {
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateField rejeita notes sem string", async () => {
    const prisma = createMockPrisma();
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateField(CONTROL_ID, "notes", true as unknown as string, {
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateField lança 404 quando registro não existe na organização", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(null);
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.updateField(CONTROL_ID, "depreciation", true, {
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updateField persiste e audita", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockResolvedValue(baseRow);
    const updated = { ...baseRow, depreciation: true };
    vi.mocked(prisma.controlContabil.update).mockResolvedValue(updated);
    const audit = { createLog: vi.fn(), logUpdateIfChanged: vi.fn() };
    const service = new ControlService(prisma, audit);

    const result = await service.updateField(CONTROL_ID, "depreciation", true, {
      userId: USER_ID,
      organizationId: ORG_ID,
      permission: 2,
    });

    expect(result.depreciation).toBe(true);
    expect(audit.logUpdateIfChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        organizationId: ORG_ID,
        referring: "contabil.control",
        referringId: CONTROL_ID,
      }),
    );
  });

  it("create propaga ServiceError sem embrulhar em 500", async () => {
    const prisma = createMockPrisma();
    vi.mocked(prisma.controlContabil.findFirst).mockRejectedValue(
      new ServiceError(409, "Conflito."),
    );
    const service = new ControlService(prisma, { createLog: vi.fn(), logUpdateIfChanged: vi.fn() });

    await expect(
      service.create({
        userId: USER_ID,
        organizationId: ORG_ID,
        clientId: CLIENT_ID,
        competence: "2024-01",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
