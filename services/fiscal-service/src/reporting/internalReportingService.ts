import { ServiceError } from "@workspace/shared";

import {
  type FiscalIcmsReportingSource,
  getFiscalIcmsReportingFields,
} from "./fiscalIcmsReportingCatalog.js";
import {
  type FiscalNcmReportingSource,
  getFiscalNcmReportingFields,
} from "./fiscalNcmReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(
    private readonly prisma: {
      icms: ReportingDelegate;
      ncm: ReportingDelegate;
    },
  ) {}

  async extract(input: {
    organizationId: string;
    source: FiscalIcmsReportingSource | FiscalNcmReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const isIcms = input.source === "fiscal.icms";
    const allowedFields = isIcms
      ? getFiscalIcmsReportingFields("fiscal.icms")
      : getFiscalNcmReportingFields("fiscal.ncm");
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate = isIcms ? this.prisma.icms : this.prisma.ncm;
    const rows = await delegate.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit + 1,
    });

    return {
      rows: rows.slice(0, input.limit),
      reachedLimit: rows.length > input.limit,
    };
  }
}
