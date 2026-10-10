import {
  type ListObligationPortfolioQuery,
  OBLIGATION_ITEMS,
} from "../schemas/obligation.schemas.js";

/** Estado do item: false = pendente, true = concluído, null = não possui. */
const STATE_VALUE = { pending: false, done: true, none: null } as const;

const portfolioSelect = {
  id: true,
  client_id: true,
  competence: true,
  responsavel_id: true,
  advance: true,
  payroll: true,
  charges: true,
  assistance_fee: true,
  bem_mais: true,
  bsf: true,
  va: true,
  vt: true,
  group_snapshot_id: true,
  group_snapshot_name: true,
  group_snapshot_policy: true,
  client: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
} as const;

export type ObligationPortfolioPrisma = {
  obrigationsPessoal: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    count(args: Record<string, unknown>): Promise<number>;
  };
};

export function buildObligationPortfolioWhere(
  organizationId: string,
  query: ListObligationPortfolioQuery,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    organization_id: organizationId,
    competence: query.competence,
  };
  if (query.responsavel_id) where.responsavel_id = query.responsavel_id;
  if (query.group_id) where.group_snapshot_id = query.group_id;
  if (query.state && query.item) {
    where[query.item] = STATE_VALUE[query.state];
  } else if (query.state === "pending") {
    where.OR = OBLIGATION_ITEMS.map((item) => ({ [item]: false }));
  }
  return where;
}

/** Carteira da competência: filtros e paginação no banco, sempre presos à organização. */
export async function listObligationPortfolio(
  prisma: ObligationPortfolioPrisma,
  organizationId: string,
  query: ListObligationPortfolioQuery,
) {
  const where = buildObligationPortfolioWhere(organizationId, query);
  const [items, total] = await Promise.all([
    prisma.obrigationsPessoal.findMany({
      where,
      select: portfolioSelect,
      orderBy: [{ client: { name: "asc" } }, { id: "asc" }],
      skip: (query.page - 1) * query.page_size,
      take: query.page_size,
    }),
    prisma.obrigationsPessoal.count({ where }),
  ]);
  return { items, total, page: query.page, page_size: query.page_size };
}
