import {
  collectReportingRows,
  executeReportingQuery,
  REPORTING_QUERY_PAGE_SIZE as REPORTING_DB_PAGE_SIZE,
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
    cursor?: { id: string };
    skip?: number;
    orderBy: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type ReportingPage = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
  nextCursor?: string;
};

async function loadReportingPage(
  delegate: ReportingDelegate,
  organizationId: string,
  fields: readonly string[],
  limit: number,
  cursor?: string,
): Promise<ReportingPage> {
  const rows = await delegate.findMany({
    where: { organization_id: organizationId },
    select: Object.fromEntries(["id", ...fields].map((field) => [field, true])),
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: "asc" },
    take: limit + 1,
  });
  const pageRows = rows.slice(0, limit);
  const lastId = pageRows[pageRows.length - 1]?.id;
  const reachedLimit = rows.length > limit;
  return {
    rows: projectRows(pageRows, fields),
    reachedLimit,
    ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
  };
}

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
    organizationId: string;
    source: RegularizePrimaryReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeLicenseReportingService(transaction, true).extract(input),
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

    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      loadReportingPage(delegate, input.organizationId, fields, limit, cursor);
    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        { loadPage: (fields, limit, cursor) => loadPage(fields, limit, cursor) },
      );
    }

    const result = await collectReportingRows(
      (limit, cursor) => loadPage(input.fields, limit, cursor),
      input.limit + 1,
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
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
    organizationId: string;
    source: RegularizeMunicipalTaxesReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeMunicipalTaxesReportingService(transaction, true).extract(input),
      );
    }
    const allowedFields = getRegularizeMunicipalTaxesReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      loadReportingPage(this.prisma.municipalTaxes, input.organizationId, fields, limit, cursor);
    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        { loadPage: (fields, limit, cursor) => loadPage(fields, limit, cursor) },
      );
    }

    const result = await collectReportingRows(
      (limit, cursor) => loadPage(input.fields, limit, cursor),
      input.limit + 1,
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }
}
