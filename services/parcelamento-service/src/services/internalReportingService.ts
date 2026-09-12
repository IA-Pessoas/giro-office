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
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        (fields, limit, offset) =>
          this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields = getInternalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.getDelegate(input.source).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
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
