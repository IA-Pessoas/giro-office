import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { type DteImportFormat, dteDedupeKey, parseDteImport } from "./dteImportParser.js";

export type DteImportDuplicate = { row: number; aviso: string; cnpj_cpf: string };

export type DteImportListPage = {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

// Importação manual de avisos DTE (#1744). Só o resumo, as recusas e as duplicatas ficam
// guardados para conferência; o HTML/JSON colado é descartado depois da leitura.
export class DteImportService {
  constructor(private readonly prisma: PrismaClient) {}

  async importNotices(input: {
    organizationId: string;
    userId: string;
    format: DteImportFormat;
    content: string;
  }): Promise<Record<string, unknown>> {
    const parsed = parseDteImport(input.format, input.content);
    const keyed = await Promise.all(
      parsed.notices.map(async (notice) => ({ ...notice, key: await dteDedupeKey(notice.fields) })),
    );

    const existing = await this.prisma.regularizeDteNotice.findMany({
      where: {
        organization_id: input.organizationId,
        dedupe_key: { in: keyed.map((notice) => notice.key) },
      },
      select: { dedupe_key: true },
    });
    const seen = new Set(existing.map((row) => row.dedupe_key));
    const fresh: typeof keyed = [];
    const duplicates: DteImportDuplicate[] = [];
    for (const notice of keyed) {
      if (seen.has(notice.key)) {
        duplicates.push({
          row: notice.row,
          aviso: notice.fields.aviso,
          cnpj_cpf: notice.fields.cnpj_cpf,
        });
        continue;
      }
      seen.add(notice.key);
      fresh.push(notice);
    }

    const importId = crypto.randomUUID();
    return this.prisma.$transaction(async (transaction) => {
      const created = await transaction.regularizeDteImport.create({
        data: {
          id: importId,
          organization_id: input.organizationId,
          user_id: input.userId,
          format: input.format,
          total_rows: parsed.totalRows,
          created_count: fresh.length,
          duplicate_count: duplicates.length,
          rejected_count: parsed.rejections.length,
          duplicates: duplicates as Prisma.InputJsonValue,
          rejections: parsed.rejections as Prisma.InputJsonValue,
        },
      });
      const { count } = await transaction.regularizeDteNotice.createMany({
        data: fresh.map((notice) => ({
          ...notice.fields,
          organization_id: input.organizationId,
          import_id: importId,
          dedupe_key: notice.key,
          pending_reading: notice.pendingReading,
        })),
        skipDuplicates: true,
      });
      if (count === fresh.length) return created;

      // Outra importação gravou o mesmo aviso entre a consulta e a escrita: o índice único
      // segurou a duplicata, falta só acertar a contagem.
      // ponytail: essas linhas não entram na lista `duplicates`; listar exige reler as chaves.
      return transaction.regularizeDteImport.update({
        where: { id: importId },
        data: {
          created_count: count,
          duplicate_count: duplicates.length + fresh.length - count,
        },
      });
    });
  }

  async listImports(input: {
    organizationId: string;
    page: number;
    limit: number;
  }): Promise<DteImportListPage> {
    const where = { organization_id: input.organizationId };
    const [data, total] = await Promise.all([
      this.prisma.regularizeDteImport.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.regularizeDteImport.count({ where }),
    ]);
    return {
      data,
      total,
      page: input.page,
      limit: input.limit,
      hasMore: input.page * input.limit < total,
    };
  }
}
