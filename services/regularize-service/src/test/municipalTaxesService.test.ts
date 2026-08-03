import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { MunicipalTaxesService } from "../services/municipalTaxesService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";

function createPrismaMock() {
  return {
    client: {
      count: vi.fn(async () => 41),
      findMany: vi.fn(async () => [
        {
          id: "client-21",
          dominio_code: "CASTELO",
          name: "Castelo Contabilidade",
          cpf_cnpj: "12345678000199",
          city: "Salvador",
          municipalTaxes: [{ id: "tax-21" }],
        },
      ]),
    },
  };
}

describe("MunicipalTaxesService.list", () => {
  it.each([
    ["TFF", "tff_is_applicable"],
    ["TLP", "tlp_is_applicable"],
    ["TLL", "tll_is_applicable"],
  ] as const)("filters created %s municipal taxes by %s before counting and paginating matching clients", async (type, applicabilityField) => {
    const prisma = createPrismaMock();
    const service = new MunicipalTaxesService(prisma as unknown as PrismaClient);

    const page = await service.list({
      organizationId,
      year: 2026,
      search: "Castelo",
      status: "Criado",
      type,
      page: 2,
      limit: 20,
    });

    const where = {
      organization_id: organizationId,
      status: "Ativo",
      OR: [
        { name: { contains: "Castelo", mode: "insensitive" } },
        { cpf_cnpj: { contains: "Castelo", mode: "insensitive" } },
        { city: { contains: "Castelo", mode: "insensitive" } },
      ],
      municipalTaxes: {
        some: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
      },
    };

    expect(prisma.client.count).toHaveBeenCalledWith({ where });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 20,
        take: 20,
        select: expect.objectContaining({
          municipalTaxes: expect.objectContaining({
            where: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
          }),
        }),
      }),
    );
    expect(page).toEqual({
      data: [
        {
          id: "client-21",
          dominio_code: "CASTELO",
          name: "Castelo Contabilidade",
          cpf_cnpj: "12345678000199",
          city: "Salvador",
          municipalTaxes: [{ id: "tax-21" }],
        },
      ],
      total: 41,
      page: 2,
      limit: 20,
      hasMore: true,
    });
  });

  it.each([
    ["TFF", "tff_is_applicable"],
    ["TLP", "tlp_is_applicable"],
    ["TLL", "tll_is_applicable"],
  ] as const)("keeps organization and year scoping for %s across pending and all status branches", async (type, applicabilityField) => {
    const prisma = createPrismaMock();
    const service = new MunicipalTaxesService(prisma as unknown as PrismaClient);

    await service.list({
      organizationId,
      year: 2026,
      search: "",
      status: "Pendente",
      type,
      page: 1,
      limit: 20,
    });

    const where = {
      organization_id: organizationId,
      status: "Ativo",
      municipalTaxes: {
        none: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
      },
    };

    expect(prisma.client.count).toHaveBeenCalledWith({ where });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 0,
        take: 20,
        select: expect.objectContaining({
          municipalTaxes: expect.objectContaining({
            where: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
          }),
        }),
      }),
    );

    await service.list({
      organizationId,
      year: 2026,
      search: "",
      status: "Todos",
      type,
      page: 1,
      limit: 20,
    });

    expect(prisma.client.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          organization_id: organizationId,
          status: "Ativo",
          municipalTaxes: {
            some: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
          },
        },
        select: expect.objectContaining({
          municipalTaxes: expect.objectContaining({
            where: { organization_id: organizationId, year: 2026, [applicabilityField]: true },
          }),
        }),
      }),
    );
  });
});
