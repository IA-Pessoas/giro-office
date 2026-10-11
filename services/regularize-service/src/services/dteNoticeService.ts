import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { RegularizeLogService } from "./regularizeLogService.js";

// A tela repete este valor em RegularizeDteInbox.tsx para mostrar a data inicial no filtro.
export const DTE_NOTICE_DEFAULT_WINDOW_DAYS = 45;
export const DTE_NOTICE_READING_FILTERS = ["Todos", "Pendente", "Lido"] as const;
export type DteNoticeReadingFilter = (typeof DTE_NOTICE_READING_FILTERS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_REFERRING = "regularize.dte_notices";

export type DteNoticeListParams = {
  organizationId: string;
  from?: Date;
  to?: Date;
  tipo?: string;
  search: string;
  reading: DteNoticeReadingFilter;
  page: number;
  limit: number;
};

export type DteNoticeListPage = {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

// Caixa de avisos DTE (#1745): consulta e estado de leitura dos avisos importados (#1744),
// como o regularize/pages/dte/home.php do legado. O período é pela data de emissão do aviso;
// quando o texto dela não pôde ser lido, vale a data da importação para o aviso não sumir.
export class DteNoticeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // from e to são dias (00:00 UTC), os dois incluídos.
  async list(params: DteNoticeListParams): Promise<DteNoticeListPage> {
    const now = this.now();
    const from =
      params.from ??
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - DTE_NOTICE_DEFAULT_WINDOW_DAYS,
        ),
      );
    const period = {
      gte: from,
      ...(params.to ? { lt: new Date(params.to.getTime() + DAY_MS) } : {}),
    };
    // A data da importação é um instante em UTC, e o dia pedido é o de quem consulta: um dia
    // a mais no fim, para o aviso importado à noite não ficar fora do próprio dia.
    const importPeriod = {
      gte: from,
      ...(params.to ? { lt: new Date(params.to.getTime() + 2 * DAY_MS) } : {}),
    };
    const where: Prisma.RegularizeDteNoticeWhereInput = {
      organization_id: params.organizationId,
      OR: [{ data_emissao_at: period }, { data_emissao_at: null, created_at: importPeriod }],
      // O tipo gravado é o atributo class inteiro do selo: busca pelo trecho para não perder
      // aviso com classe extra. Vazio pede os avisos sem cor.
      ...(params.tipo === undefined
        ? {}
        : { tipo: params.tipo === "" ? "" : { contains: params.tipo } }),
      ...(params.search ? { aviso: { contains: params.search, mode: "insensitive" } } : {}),
      ...(params.reading === "Todos" ? {} : { pending_reading: params.reading === "Pendente" }),
    };
    const [data, total] = await Promise.all([
      this.prisma.regularizeDteNotice.findMany({
        where,
        // Emissão mais recente primeiro; o id desempata a paginação de avisos com a mesma data.
        orderBy: [
          { data_emissao_at: { sort: "desc", nulls: "last" } },
          { created_at: "desc" },
          { id: "desc" },
        ],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.regularizeDteNotice.count({ where }),
    ]);
    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      hasMore: params.page * params.limit < total,
    };
  }

  async setReading(input: {
    organizationId: string;
    userId: string;
    id: string;
    pendingReading: boolean;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.regularizeDteNotice.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });
    if (!existing) throw new ServiceError(404, "Aviso DTE não encontrado.");
    if (existing.pending_reading === input.pendingReading) return existing;

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.regularizeDteNotice.update({
        where: { id: existing.id },
        data: { pending_reading: input.pendingReading },
      });
      await new RegularizeLogService(transaction).createLog({
        userId: input.userId,
        organizationId: input.organizationId,
        action: "Atualizacao",
        referring: LOG_REFERRING,
        referringId: existing.id,
        changes: {
          pending_reading: { from: existing.pending_reading, to: input.pendingReading },
        },
      });
      return updated;
    });
  }
}
