import {
  executeReportingQuery,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import {
  getRegularizeLicenseReportingFields,
  type RegularizeLicenseReportingSource,
} from "./regularizeLicenseReportingCatalog.js";
import {
  getRegularizeMunicipalTaxesReportingFields,
  type RegularizeMunicipalTaxesReportingSource,
} from "./regularizeMunicipalTaxesReportingCatalog.js";
import {
  getRegularizeProcessReportingFields,
  type RegularizeProcessReportingSource,
} from "./regularizeProcessReportingCatalog.js";

type RegularizePrimaryReportingSource =
  | RegularizeLicenseReportingSource
  | RegularizeProcessReportingSource;

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [field, row[field]]).filter(([, value]) => value !== undefined),
    ),
  );
}

export class RegularizeLicenseReportingService {
  constructor(
    private readonly prisma: {
      license: ReportingDelegate;
      process?: ReportingDelegate;
    },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: RegularizePrimaryReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeLicenseReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields =
      input.source === "regularize.licenses"
        ? getRegularizeLicenseReportingFields(input.source)
        : getRegularizeProcessReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate =
      input.source === "regularize.licenses" ? this.prisma.license : this.prisma.process;
    if (!delegate) {
      throw new ServiceError(500, "Fonte interna de relatórios não configurada.");
    }

    const rows = await delegate.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}

export class RegularizeMunicipalTaxesReportingService {
  constructor(
    private readonly prisma: { municipalTaxes: ReportingDelegate },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: RegularizeMunicipalTaxesReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeMunicipalTaxesReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields = getRegularizeMunicipalTaxesReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.municipalTaxes.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
