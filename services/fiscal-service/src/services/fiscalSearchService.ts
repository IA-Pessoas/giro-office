import prismaClient from "../integrations/prisma.js";

export type FiscalSearchServicePrisma = typeof prismaClient;

const NCM_SELECT = {
  id: true,
  tax_regime: true,
  ncm_code: true,
  federal_taxation_type: true,
  description: true,
  ncm_notes: true,
  cst_pis_outgoing: true,
  cst_cofins_outgoing: true,
  product_group: true,
  validity_start_date: true,
  information_source: true,
  reference_legislation: true,
  validity_end_date: true,
} as const;

const ICMS_SELECT = {
  id: true,
  state: true,
  item_number: true,
  cest_code: true,
  description: true,
  interstate_agreement: true,
  applied_original_mva: true,
  adjusted_mva: true,
  original_mva: true,
} as const;

const IPI_SELECT = {
  id: true,
  ncm: true,
  ex: true,
  description: true,
  aliquot: true,
} as const;

export class FiscalSearchService {
  constructor(private readonly prisma: FiscalSearchServicePrisma = prismaClient) {}

  async searchByNcmCode(
    ncmCode: string,
    organizationId: string,
  ): Promise<{
    ncm: unknown;
    icms: unknown[];
    ipi: unknown[];
  }> {
    const ncmPrefix = ncmCode.substring(0, 4);

    const ncmDataQuery = this.prisma.ncm.findFirst({
      where: { organization_id: organizationId, ncm_code: ncmCode },
      select: NCM_SELECT,
    });

    const icmsDataQuery = this.prisma.icms.findMany({
      where: {
        organization_id: organizationId,
        description: { contains: ncmPrefix, mode: "insensitive" },
      },
      select: ICMS_SELECT,
    });

    const ipiDataQuery = this.prisma.ipi.findMany({
      where: { organization_id: organizationId, ncm: ncmCode },
      select: IPI_SELECT,
      orderBy: { ncm: "asc" },
    });

    const [ncm, icms, ipi] = await this.prisma.$transaction([
      ncmDataQuery,
      icmsDataQuery,
      ipiDataQuery,
    ]);

    return { ncm, icms, ipi };
  }
}
