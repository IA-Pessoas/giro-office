import { ServiceError } from "@workspace/shared";
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
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(private readonly prisma: ParcelamentoPrismaClient) {}

  async extract(input: {
    organizationId: string;
    source: InternalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<readonly Record<string, unknown>[]> {
    const allowedFields = getInternalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    return this.getDelegate(input.source).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
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
