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
  otherInstallmentId,
  otherOrganizationId,
  parcelamentoContext,
} from "./parcelamentoTestUtils.js";

describe("InstallmentService uniqueness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create rejeita agreement_number duplicado na mesma organizacao", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({ id: otherInstallmentId, agreement_number: "AC-123" }),
    );
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.create(parcelamentoContext, createCreateInstallmentBody()),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: { organization_id: organizationId, agreement_number: "AC-123" },
    });
    expect(prisma.installment.create).not.toHaveBeenCalled();
  });

  it("create converte corrida unique P2002 de agreement_number em conflito de dominio", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    prisma.installment.create.mockRejectedValueOnce({ code: "P2002" });
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.create(parcelamentoContext, createCreateInstallmentBody()),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Ja existe parcelamento com este numero de acordo.",
    });
  });

  it("allows same agreement_number in another organization", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(parcelamentoContext, createCreateInstallmentBody());

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: { organization_id: organizationId, agreement_number: "AC-123" },
    });
    expect(prisma.installment.findFirst).not.toHaveBeenCalledWith({
      where: { organization_id: otherOrganizationId, agreement_number: "AC-123" },
    });
    expect(prisma.installment.create).toHaveBeenCalled();
  });

  it("create permite multiplos agreement_number nulos quando fallback operacional nao conflita", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(
      parcelamentoContext,
      createCreateInstallmentBody({ agreement_number: "   ", type: "Estadual" }),
    );

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        type: "Estadual",
        legal_nature: "Tributario",
        jurisdiction: "PGFN",
        enrollment_date: enrollmentDate,
        status: { notIn: ["Liquidado", "Cancelado", "Encerrado", "Inativo"] },
      },
    });
    expect(prisma.installment.create).toHaveBeenCalled();
  });

  it("allows fallback duplicate when the previous status is closed", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.create(
      parcelamentoContext,
      createCreateInstallmentBody({ agreement_number: null }),
    );

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        client_id: clientId,
        type: "Federal",
        legal_nature: "Tributario",
        jurisdiction: "PGFN",
        enrollment_date: enrollmentDate,
        status: { notIn: ["Liquidado", "Cancelado", "Encerrado", "Inativo"] },
      },
    });
    expect(prisma.installment.create).toHaveBeenCalled();
  });

  it("create rejeita fallback operacional duplicado quando nao ha agreement_number", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(
      createInstallmentFixture({ id: otherInstallmentId, agreement_number: null }),
    );
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.create(parcelamentoContext, createCreateInstallmentBody({ agreement_number: null })),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["Liquidado", "Cancelado", "Encerrado", "Inativo"] },
        }),
      }),
    );
  });

  it("patch ignora o proprio id ao revalidar agreement_number", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst
      .mockResolvedValueOnce(createInstallmentFixture({ id: installmentId }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        createInstallmentFixture({ id: installmentId, agreement_number: "AC-999" }),
      );
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await service.patch(parcelamentoContext, installmentId, { agreement_number: "AC-999" });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        agreement_number: "AC-999",
        NOT: { id: installmentId },
      },
    });
  });

  it("revalidates uniqueness when patch inserts agreement_number", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst
      .mockResolvedValueOnce(
        createInstallmentFixture({ id: installmentId, agreement_number: null }),
      )
      .mockResolvedValueOnce(
        createInstallmentFixture({ id: otherInstallmentId, agreement_number: "AC-999" }),
      );
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.patch(parcelamentoContext, installmentId, { agreement_number: " AC-999 " }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: organizationId,
        agreement_number: "AC-999",
        NOT: { id: installmentId },
      },
    });
    expect(prisma.installment.update).not.toHaveBeenCalled();
  });

  it("patch rejeita fallback operacional duplicado usando NOT id", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst
      .mockResolvedValueOnce(
        createInstallmentFixture({ id: installmentId, agreement_number: null }),
      )
      .mockResolvedValueOnce(createInstallmentFixture({ id: otherInstallmentId }));
    const service = new InstallmentService({
      prisma: prisma as never,
      auditService: createAuditMock(),
    });

    await expect(
      service.patch(parcelamentoContext, installmentId, {
        agreement_number: null,
        jurisdiction: "PGFN",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organization_id: organizationId,
        client_id: clientId,
        type: "Federal",
        legal_nature: "Tributario",
        jurisdiction: "PGFN",
        enrollment_date: enrollmentDate,
        status: { notIn: ["Liquidado", "Cancelado", "Encerrado", "Inativo"] },
        NOT: { id: installmentId },
      }),
    });
  });
});
