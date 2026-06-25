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
    controlContabil: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as ControlServicePrisma;
}

describe("ControlService", () => {
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
