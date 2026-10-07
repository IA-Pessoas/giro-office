import { normalizeCpfCnpj } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

export interface CoringaFilters {
  page: number;
  limit: number;
  search?: string;
  regime?: string;
  dataEntrada?: string;
  porte?: string;
  segmento?: string;
  status?: string;
  contabil?: boolean;
  fiscal?: boolean;
  pessoal?: boolean;
  tecnologia?: boolean;
  infoproduto?: boolean;
  consultoria?: boolean;
  licitacao?: boolean;
}

const coringaSelect = {
  id: true,
  organization_id: true,
  dominio_code: true,
  name: true,
  company_name: true,
  cpf_cnpj: true,
  regime: true,
  created_at: true,
  size: true,
  segment: true,
  coringa_status: true,
  contabil: true,
  fiscal: true,
  pessoal: true,
  tecnologia: true,
  infoproduto: true,
  consultoria: true,
  licitacao: true,
} satisfies Prisma.ClientSelect;

export type CoringaClient = Prisma.ClientGetPayload<{ select: typeof coringaSelect }>;

export interface CoringaPage {
  items: CoringaClient[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const CORINGA_PDF_BATCH_SIZE = 500;

export function coringaWhere(
  organizationId: string,
  filters: Omit<CoringaFilters, "page" | "limit">,
): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = { organization_id: organizationId };
  if (filters.search) {
    const term = filters.search;
    const documentTerm = /^[0-9./-]+$/u.test(term) ? normalizeCpfCnpj(term) || term : term;
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { company_name: { contains: term, mode: "insensitive" } },
      { cpf_cnpj: { contains: documentTerm, mode: "insensitive" } },
      { dominio_code: { contains: term, mode: "insensitive" } },
    ];
  }
  if (filters.regime) where.regime = { equals: filters.regime, mode: "insensitive" };
  if (filters.porte) where.size = { equals: filters.porte, mode: "insensitive" };
  if (filters.segmento) where.segment = { equals: filters.segmento, mode: "insensitive" };
  if (filters.status) where.coringa_status = { equals: filters.status, mode: "insensitive" };
  if (filters.contabil !== undefined) where.contabil = filters.contabil;
  if (filters.fiscal !== undefined) where.fiscal = filters.fiscal;
  if (filters.pessoal !== undefined) where.pessoal = filters.pessoal;
  if (filters.tecnologia !== undefined) where.tecnologia = filters.tecnologia;
  if (filters.infoproduto !== undefined) where.infoproduto = filters.infoproduto;
  if (filters.consultoria !== undefined) where.consultoria = filters.consultoria;
  if (filters.licitacao !== undefined) where.licitacao = filters.licitacao;
  if (filters.dataEntrada) {
    // Horário civil de São Paulo desde 2019, sem horário de verão.
    const start = new Date(`${filters.dataEntrada}T03:00:00.000Z`);
    where.created_at = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
  }
  return where;
}

export async function listCoringaClients(
  prisma: PrismaClient,
  organizationId: string,
  filters: CoringaFilters,
): Promise<CoringaPage> {
  const where = coringaWhere(organizationId, filters);
  const items = await prisma.client.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (filters.page - 1) * filters.limit,
    take: filters.limit,
    select: coringaSelect,
  });
  const total = await prisma.client.count({ where });
  return {
    items,
    total,
    page: filters.page,
    pageSize: filters.limit,
    hasMore: filters.page * filters.limit < total,
  };
}

export async function* iterateCoringaClients(
  prisma: PrismaClient,
  organizationId: string,
  filters: Omit<CoringaFilters, "page" | "limit">,
): AsyncGenerator<CoringaClient[]> {
  const where = coringaWhere(organizationId, filters);
  let cursor: string | undefined;
  while (true) {
    const rows = await prisma.client.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      take: CORINGA_PDF_BATCH_SIZE,
      select: coringaSelect,
    });
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < CORINGA_PDF_BATCH_SIZE) return;
    cursor = rows[rows.length - 1].id;
  }
}
