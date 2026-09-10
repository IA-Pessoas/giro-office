import {
  executeReportingQuery,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import type { ParcelamentoPrismaClient } from "../prisma/index.js";
import {
  getInternalReportingFields,
  type InternalReportingSource,
} from "../reporting/internalReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(
    private readonly prisma: ParcelamentoPrismaClient,
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: InternalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<readonly Record<string, unknown>[]> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      const result = await executeReportingQuery(
        { ...input, query: input.query },
        async (fields, limit, offset) => {
          const rows = await this.extract({ ...input, query: undefined, fields, limit, offset });
          return { rows, reachedLimit: rows.length === limit };
        },
      );
      return result.rows;
    }
    const allowedFields = getInternalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    return this.getDelegate(input.source).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit,
    });
  }

  private getDelegate(source: InternalReportingSource): ReportingDelegate {
    switch (source) {
      case "parcelamento.installments":
        return this.prisma.installment as unknown as ReportingDelegate;
      case "parcelamento.installment_competencies":
        return this.prisma.installmentCompetencies as unknown as ReportingDelegate;
      case "parcelamento.panoramas":
        return this.prisma.panoramaParcelameto as unknown as ReportingDelegate;
    }
  }
}
