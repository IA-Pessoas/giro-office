import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PanoramaService } from "../services/panoramaService.js";
import {
  clientId,
  createCreatePanoramaBody,
  createPanoramaFixture,
  createPrismaMock,
  organizationId,
  otherClientId,
  panoramaId,
  parcelamentoContext,
  responsavelId,
} from "./parcelamentoTestUtils.js";

describe("PanoramaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createService(prisma = createPrismaMock()) {
    const service = new PanoramaService({ prisma: prisma as never });

    return { service, prisma };
  }

  it("lists panoramas scoped by organization with filters and pagination", async () => {
    const prisma = createPrismaMock();
    prisma.panoramaParcelameto.count.mockResolvedValueOnce(2);
    prisma.panoramaParcelameto.findMany.mockResolvedValueOnce([createPanoramaFixture()]);
    const { service } = createService(prisma);

    const result = await service.list(parcelamentoContext, {
      page: 2,
      page_size: 1,
      competence: "2026-07",
      client_id: clientId,
      responsavel_id: responsavelId,
    });

    const countWhere = prisma.panoramaParcelameto.count.mock.calls[0]?.[0].where;
    expect(countWhere).toEqual({
      organization_id: organizationId,
      competence: "2026-07",
      client_id: clientId,
      responsavel_id: responsavelId,
    });
    expect(prisma.panoramaParcelameto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: countWhere,
        orderBy: { id: "asc" },
        skip: 1,
        take: 1,
      }),
    );
    expect(result).toMatchObject({ total: 2, page: 2, page_size: 1, has_more: false });
    expect(result.items[0]).not.toHaveProperty("organization_id");
  });

  it("creates a panorama with boolean defaults", async () => {
    const prisma = createPrismaMock();
    prisma.client.findFirst.mockResolvedValueOnce({
      id: clientId,
      organization_id: organizationId,
    });
    prisma.panoramaParcelameto.findFirst.mockResolvedValueOnce(null);
    const { service } = createService(prisma);

    const result = await service.create(parcelamentoContext, createCreatePanoramaBody());

    expect(prisma.panoramaParcelameto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          competence: "2026-07",
          cnd_municipal: false,
          cnd_state: false,
          cnd_federal: false,
          cnd_fgts: false,
          cnd_labor: false,
          protests: false,
          state_tax_situation: false,
          federal_tax_situation: false,
          organization_id: organizationId,
        }),
      }),
    );
    expect(result).toMatchObject({ id: panoramaId, client_id: clientId, competence: "2026-07" });
    expect(result).not.toHaveProperty("organization_id");
  });

  it("blocks duplicate client and competence inside organization", async () => {
    const prisma = createPrismaMock();
    prisma.client.findFirst.mockResolvedValueOnce({
      id: clientId,
      organization_id: organizationId,
    });
    prisma.panoramaParcelameto.findFirst.mockResolvedValueOnce(createPanoramaFixture());
    const { service } = createService(prisma);

    await expect(
      service.create(parcelamentoContext, createCreatePanoramaBody()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("patches only whitelisted panorama fields", async () => {
    const prisma = createPrismaMock();
    prisma.panoramaParcelameto.findFirst
      .mockResolvedValueOnce(createPanoramaFixture())
      .mockResolvedValueOnce(
        createPanoramaFixture({ cnd_fgts: true, responsavel_id: responsavelId }),
      );
    prisma.user.findFirst.mockResolvedValueOnce({
      id: responsavelId,
      organization_id: organizationId,
    });
    const { service } = createService(prisma);

    await service.patch(parcelamentoContext, panoramaId, {
      cnd_fgts: true,
      responsavel_id: responsavelId,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: responsavelId, organization_id: organizationId },
    });
    expect(prisma.panoramaParcelameto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: panoramaId, organization_id: organizationId },
        data: { cnd_fgts: true, responsavel_id: responsavelId },
      }),
    );
    expect(prisma.panoramaParcelameto.update).not.toHaveBeenCalled();
  });

  it("validates responsavel_id inside organization when provided", async () => {
    const prisma = createPrismaMock();
    prisma.panoramaParcelameto.findFirst.mockResolvedValueOnce(createPanoramaFixture());
    prisma.user.findFirst.mockResolvedValueOnce(null);
    const { service } = createService(prisma);

    await expect(
      service.patch(parcelamentoContext, panoramaId, { responsavel_id: responsavelId }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("generates missing panoramas idempotently", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientId }, { id: otherClientId }]);
    prisma.panoramaParcelameto.findMany.mockResolvedValueOnce([
      createPanoramaFixture({ client_id: clientId }),
    ]);
    prisma.panoramaParcelameto.createMany.mockResolvedValueOnce({ count: 1 });
    const { service } = createService(prisma);

    const result = await service.generateForCompetence(parcelamentoContext, "2026-07");

    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: "Ativo" },
      select: { id: true },
    });
    expect(prisma.panoramaParcelameto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          competence: "2026-07",
          client_id: { in: [clientId, otherClientId] },
        },
      }),
    );
    expect(prisma.panoramaParcelameto.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          client_id: otherClientId,
          competence: "2026-07",
          organization_id: organizationId,
        }),
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ created: 1, existing: 1, totalActiveClients: 2 });
  });

  it("does not overwrite existing panorama rows during generation", async () => {
    const prisma = createPrismaMock();
    prisma.client.findMany.mockResolvedValueOnce([{ id: clientId }, { id: otherClientId }]);
    prisma.panoramaParcelameto.findMany.mockResolvedValueOnce([
      createPanoramaFixture({ client_id: clientId }),
    ]);
    const { service } = createService(prisma);

    await service.generateForCompetence(parcelamentoContext, "2026-07");

    const createdRows = prisma.panoramaParcelameto.createMany.mock.calls[0]?.[0].data;
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({ client_id: otherClientId });
  });
});
