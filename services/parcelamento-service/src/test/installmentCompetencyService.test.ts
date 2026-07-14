import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstallmentCompetencyService } from "../services/installmentCompetencyService.js";
import {
  competencyId,
  createAuditMock,
  createCreateInstallmentCompetencyBody,
  createInstallmentCompetencyFixture,
  createInstallmentFixture,
  createPrismaMock,
  installmentId,
  organizationId,
  otherOrganizationId,
  parcelamentoContext,
  userId,
} from "./parcelamentoTestUtils.js";

describe("InstallmentCompetencyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createService(prisma = createPrismaMock()) {
    const installmentService = {
      recalculateAggregates: vi.fn(async () => createInstallmentFixture()),
    };
    const audit = createAuditMock();
    const service = new InstallmentCompetencyService({
      prisma: prisma as never,
      installmentService,
      auditService: audit,
    });

    return { service, prisma, installmentService, audit };
  }

  it("lists competencies for an installment scoped by organization", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    prisma.installmentCompetencies.count.mockResolvedValueOnce(2);
    prisma.installmentCompetencies.findMany.mockResolvedValueOnce([
      createInstallmentCompetencyFixture({ id: competencyId }),
    ]);
    const { service } = createService(prisma);

    const result = await service.list(parcelamentoContext, installmentId, {
      page: 2,
      page_size: 1,
    });

    expect(prisma.installment.findFirst).toHaveBeenCalledWith({
      where: { id: installmentId, organization_id: organizationId },
    });
    const countWhere = prisma.installmentCompetencies.count.mock.calls[0]?.[0].where;
    expect(prisma.installmentCompetencies.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: countWhere,
        orderBy: { competence: "asc" },
        skip: 1,
        take: 1,
      }),
    );
    expect(countWhere).toEqual({
      installment_id: installmentId,
      organization_id: organizationId,
    });
    expect(result).toMatchObject({ total: 2, page: 2, page_size: 1, has_more: false });
    expect(result.items[0]).not.toHaveProperty("organization_id");
  });

  it("creates a competency and recalculates the parent installment", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    prisma.installmentCompetencies.findFirst.mockResolvedValueOnce(null);
    const { service, installmentService, audit } = createService(prisma);

    const result = await service.create(
      parcelamentoContext,
      installmentId,
      createCreateInstallmentCompetencyBody(),
    );

    expect(prisma.installmentCompetencies.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          installment_id: installmentId,
          organization_id: organizationId,
          competence: "2026-07",
        }),
      }),
    );
    expect(installmentService.recalculateAggregates).toHaveBeenCalledWith(
      parcelamentoContext,
      installmentId,
    );
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Cadastro",
        organizationId,
        userId,
        referring: "parcelamento.installmentsCompetencies",
        referringId: competencyId,
      }),
    );
    expect(result).toMatchObject({ id: competencyId, installment_id: installmentId });
    expect(result).not.toHaveProperty("organization_id");
  });

  it("blocks duplicate competence for the same installment", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(createInstallmentFixture());
    prisma.installmentCompetencies.findFirst.mockResolvedValueOnce(
      createInstallmentCompetencyFixture(),
    );
    const { service } = createService(prisma);

    await expect(
      service.create(parcelamentoContext, installmentId, createCreateInstallmentCompetencyBody()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("patches a competency and recalculates when progress fields change", async () => {
    const prisma = createPrismaMock();
    prisma.installmentCompetencies.findFirst
      .mockResolvedValueOnce(createInstallmentCompetencyFixture({ how_many_paid: 1 }))
      .mockResolvedValueOnce(createInstallmentCompetencyFixture({ how_many_paid: 2 }));
    const { service, installmentService } = createService(prisma);

    await service.patch(parcelamentoContext, competencyId, { how_many_paid: 2 });

    expect(prisma.installmentCompetencies.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: competencyId, organization_id: organizationId },
        data: { how_many_paid: 2 },
      }),
    );
    expect(prisma.installmentCompetencies.update).not.toHaveBeenCalled();
    expect(installmentService.recalculateAggregates).toHaveBeenCalledWith(
      parcelamentoContext,
      installmentId,
    );
  });

  it("does not recalculate when only notes change", async () => {
    const prisma = createPrismaMock();
    prisma.installmentCompetencies.findFirst
      .mockResolvedValueOnce(createInstallmentCompetencyFixture({ notes: "antes" }))
      .mockResolvedValueOnce(createInstallmentCompetencyFixture({ notes: "depois" }));
    const { service, installmentService } = createService(prisma);

    await service.patch(parcelamentoContext, competencyId, { notes: "depois" });

    expect(prisma.installmentCompetencies.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: competencyId, organization_id: organizationId },
        data: { notes: "depois" },
      }),
    );
    expect(prisma.installmentCompetencies.update).not.toHaveBeenCalled();
    expect(installmentService.recalculateAggregates).not.toHaveBeenCalled();
  });

  it("returns 404 when the parent installment belongs to another organization", async () => {
    const prisma = createPrismaMock();
    prisma.installment.findFirst.mockResolvedValueOnce(null);
    const { service } = createService(prisma);

    await expect(
      service.list(
        { ...parcelamentoContext, organizationId: otherOrganizationId },
        installmentId,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
