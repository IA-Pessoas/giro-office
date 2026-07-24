import type { PrismaClient } from "../generated/prisma/client.js";

export interface PessoalOverviewSummary {
  unions: {
    total: number;
    withBaseDate: number;
    withoutBaseDate: number;
    withCnpj: number;
  };
  ldd: {
    total: number;
    open: number;
    overdue: number;
    paid: number;
  };
}

function normalizeStatus(value: string | null): string | null {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() ?? null
  );
}

export class PessoalOverviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async getSummary(context: { organizationId: string }): Promise<PessoalOverviewSummary> {
    const organizationWhere = { organization_id: context.organizationId };
    const totalUnions = await this.prisma.unionPessoal.count({ where: organizationWhere });
    const unionsWithBaseDate = await this.prisma.unionPessoal.count({
      where: { ...organizationWhere, base_date: { not: null } },
    });
    const unionsWithCnpj = await this.prisma.unionPessoal.count({
      where: { ...organizationWhere, cnpj: { not: "" } },
    });
    const lddStatusGroups = await this.prisma.lddPessoal.groupBy({
      by: ["status"] as const,
      where: organizationWhere,
      _count: { _all: true },
    });
    const lddCounts = lddStatusGroups.reduce(
      (counts, group) => {
        const count = group._count._all;
        const status = normalizeStatus(group.status);

        counts.total += count;
        if (status === "pago") {
          counts.paid += count;
        } else if (status === "vencido") {
          counts.overdue += count;
        } else {
          counts.open += count;
        }

        return counts;
      },
      { total: 0, open: 0, overdue: 0, paid: 0 },
    );

    return {
      unions: {
        total: totalUnions,
        withBaseDate: unionsWithBaseDate,
        withoutBaseDate: Math.max(totalUnions - unionsWithBaseDate, 0),
        withCnpj: unionsWithCnpj,
      },
      ldd: lddCounts,
    };
  }
}
