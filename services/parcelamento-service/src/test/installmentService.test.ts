import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstallmentService } from "../services/installmentService.js";
import {
  clientId,
  createAuditMock,
  createCreateInstallmentBody,
  createInstallmentFixture,
  createPrismaMock,
  enrollmentDate,
  installmentId,
  organizationId,
  parcelamentoContext,
  userId,
} from "./parcelamentoTestUtils.js";

describe("InstallmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create valida cliente, normaliza agreement_number, aplica defaults e audita cadastro", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new InstallmentService({ prisma: prisma as never, auditService: audit });

    const result = await service.create(parcelamentoContext, createCreateInstallmentBody());

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
    });
    expect(prisma.installment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agreement_number: "AC-123",
          client_id: clientId,
          organization_id: organizationId,
          consolidated_total_amount: 0,
          outstanding_balance: 0,
          paid_installments_count: 0,
          remaining_installments_count: 10,
          overdue_installments_count: 0,
          status: "Ativo",
          document_url: "",
          down_payment_installments_count: 0,
        }),
      }),
    );
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Cadastro",
        organizationId,
        userId,
        referring: "parcelamento.installments",
        referringId: installmentId,
      }),
    );
    expect(audit.recordChange.mock.calls[0]?.[0].changes).not.toHaveProperty("organization_id");
    expect(result).toMatchObject({ id: installmentId, agreement_number: "AC-123" });
    expect(result).not.toHaveProperty("organization_id");
  });

  it("list usa um unico where em count e findMany com paginacao e filtros", async () => {
    const prisma = createPrismaMock();
    prisma.installment.count.mockResolvedValueOnce(3);
    prisma.installment.findMany.mockResolvedValueOnce([
      createInstallmentFixture({ id: installmentId }),
    ]);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    const result = await service.list(parcelamentoContext, {
      page: 2,
      page_size: 1,
      client_id: clientId,
      status: "Ativo",
      type: "Federal",
      jurisdiction: "PGFN",
      search: "tribut",
    });

    const countWhere = prisma.installment.count.mock.calls[0]?.[0].where;
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: countWhere,
        skip: 1,
        take: 1,
        orderBy: { id: "asc" },
      }),
    );
    expect(countWhere).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      status: "Ativo",
      type: "Federal",
      jurisdiction: "PGFN",
    });
    expect(countWhere.OR).toEqual(
      expect.arrayContaining([
        { type: { contains: "tribut" } },
        { legal_nature: { contains: "tribut" } },
        { jurisdiction: { contains: "tribut" } },
        { status: { contains: "tribut" } },
      ]),
    );
    expect(result).toMatchObject({ total: 3, page: 2, page_size: 1, has_more: true });
    expect(result.items[0]).not.toHaveProperty("organization_id");
  });

  it("getById retorna 404 quando o parcelamento nao pertence a organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(service.getById(parcelamentoContext, installmentId)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prisma.installment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: installmentId, organization_id: organizationId },
      }),
    );
  });

  it("patch atualiza somente campos enviados, revalida unicidade e audita", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst
      .mockResolvedValueOnce(createInstallmentFixture({ agreement_number: null }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createInstallmentFixture({ current_month_installment_amount: 130 }))
      .mockResolvedValueOnce(createInstallmentFixture({ current_month_installment_amount: 130 }));
    prisma.installmentCompetencies.findMany.mockResolvedValueOnce([]);
    const audit = createAuditMock();
    const service = new InstallmentService({ prisma: prisma as never, auditService: audit });

    await service.patch(parcelamentoContext, installmentId, {
      agreement_number: " AC-456 ",
      current_month_installment_amount: 130,
    });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          agreement_number: "AC-456",
          NOT: { id: installmentId },
        },
      }),
    );
    expect(prisma.installment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: installmentId, organization_id: organizationId },
        data: expect.objectContaining({
          agreement_number: "AC-456",
          current_month_installment_amount: 130,
        }),
      }),
    );
    expect(prisma.installment.update).not.toHaveBeenCalled();
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Atualizacao",
        referringId: installmentId,
        changes: {
          agreement_number: { from: null, to: "AC-456" },
          current_month_installment_amount: { from: 120, to: 130 },
        },
      }),
    );
  });

  it("recalculateAggregates deriva progresso das competencias e liquida quando restante chega a zero", async () => {
    const prisma = createPrismaMock();
    const clockDate = new Date("2026-07-14T12:00:00.000Z");
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({
        agreed_installments_count: 3,
        current_month_installment_amount: 200,
        status: "Ativo",
      }),
    );
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({
        agreed_installments_count: 3,
        current_month_installment_amount: 200,
        status: "Liquidado",
        paid_installments_count: 3,
        remaining_installments_count: 0,
        outstanding_balance: 0,
        completion_date: clockDate,
      }),
    );
    prisma.installmentCompetencies.findMany.mockResolvedValueOnce([
      { how_many_paid: 1, how_many_overdue: 2 },
      { how_many_paid: 2, how_many_overdue: 4 },
    ]);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
      clock: () => clockDate,
    });

    await service.recalculateAggregates(parcelamentoContext, installmentId);

    expect(prisma.installmentCompetencies.findMany).toHaveBeenCalledWith({
      where: { installment_id: installmentId, organization_id: organizationId },
    });
    expect(prisma.installment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: installmentId, organization_id: organizationId },
        data: {
          paid_installments_count: 3,
          overdue_installments_count: 3,
          remaining_installments_count: 0,
          outstanding_balance: 0,
          status: "Liquidado",
          completion_date: clockDate,
        },
      }),
    );
    expect(prisma.installment.update).not.toHaveBeenCalled();
  });

  it("recalculateAggregates reabre parcelamento liquidado quando volta a ter saldo", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({
        agreed_installments_count: 4,
        status: "Liquidado",
        completion_date: new Date("2026-07-01T00:00:00.000Z"),
      }),
    );
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({
        agreed_installments_count: 4,
        status: "Ativo",
        paid_installments_count: 1,
        remaining_installments_count: 3,
        outstanding_balance: 360,
        completion_date: null,
      }),
    );
    prisma.installmentCompetencies.findMany.mockResolvedValueOnce([
      { how_many_paid: 1, how_many_overdue: 0 },
    ]);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.recalculateAggregates(parcelamentoContext, installmentId);

    expect(prisma.installment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: installmentId, organization_id: organizationId },
        data: expect.objectContaining({
          paid_installments_count: 1,
          remaining_installments_count: 3,
          outstanding_balance: 360,
          status: "Ativo",
          completion_date: null,
        }),
      }),
    );
  });

  it("rejeita operacoes sem organizationId no contexto", async () => {
    const service = new InstallmentService({
      prisma: createPrismaMock() as never,
      auditService: createAuditMock(),
    });

    await expect(service.list({ requestId: "missing" }, {})).rejects.toMatchObject({
      statusCode: 400,
      message: "Contexto de organizacao ausente.",
    });
  });

  it("rejeita operacoes sem userId no contexto", async () => {
    const service = new InstallmentService({
      prisma: createPrismaMock() as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.list({ requestId: "missing-user", organizationId }, {}),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Contexto de usuario ausente.",
    });
  });

  it("create rejeita cliente ausente na organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.client.findFirst.mockResolvedValueOnce(null);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.create(parcelamentoContext, createCreateInstallmentBody()),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create aceita enrollment_date omitida como null", async () => {
    const prisma = createPrismaMock();
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(
      parcelamentoContext,
      createCreateInstallmentBody({ enrollment_date: undefined }),
    );

    expect(prisma.installment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enrollment_date: null }),
      }),
    );
  });

  it("create converte enrollment_date valida para Date", async () => {
    const prisma = createPrismaMock();
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(parcelamentoContext, createCreateInstallmentBody());

    expect(prisma.installment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enrollment_date: enrollmentDate }),
      }),
    );
  });

  it("create usa transacao serializable para fallback sem numero de acordo", async () => {
    const prisma = createPrismaMock();
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(
      parcelamentoContext,
      createCreateInstallmentBody({ agreement_number: null }),
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(prisma.installment.create).toHaveBeenCalled();
  });
});
