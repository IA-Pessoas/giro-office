import {
  executeReportingQuery,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import {
  type FiscalIcmsReportingSource,
  getFiscalIcmsReportingFields,
} from "./fiscalIcmsReportingCatalog.js";
import {
  type FiscalIpiReportingSource,
  getFiscalIpiReportingFields,
} from "./fiscalIpiReportingCatalog.js";
import {
  type FiscalNcmReportingSource,
  getFiscalNcmReportingFields,
} from "./fiscalNcmReportingCatalog.js";

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
    private readonly prisma: {
      icms: ReportingDelegate;
      ncm: ReportingDelegate;
      ipi: ReportingDelegate;
    },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: FiscalIcmsReportingSource | FiscalNcmReportingSource | FiscalIpiReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const isIcms = input.source === "fiscal.icms";
    const isNcm = input.source === "fiscal.ncm";
    const allowedFields = isIcms
      ? getFiscalIcmsReportingFields("fiscal.icms")
      : isNcm
        ? getFiscalNcmReportingFields("fiscal.ncm")
        : getFiscalIpiReportingFields("fiscal.ipi");
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate = isIcms ? this.prisma.icms : isNcm ? this.prisma.ncm : this.prisma.ipi;
    const rows = await delegate.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return {
      rows: rows.slice(0, input.limit),
      reachedLimit: rows.length > input.limit,
    };
  }
}
