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
    cursor?: { id: string };
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type ReportingPage = {
  take: number;
  cursorId?: string;
  includeCursor: boolean;
};

type ReportingReadOptions = {
  cursorId?: string;
  cursorPage?: boolean;
};

const REPORTING_DB_PAGE_SIZE = 1_000;

function reportingPageOptions(page: ReportingPage) {
  if (!page.includeCursor) return { take: page.take };
  return {
    ...(page.cursorId === undefined ? {} : { cursor: { id: page.cursorId }, skip: 1 }),
    orderBy: { id: "asc" as const },
    take: page.take,
  };
}

async function readReportingRows(
  limit: number,
  options: ReportingReadOptions,
  fetchPage: (page: ReportingPage) => Promise<readonly Record<string, unknown>[]>,
): Promise<readonly Record<string, unknown>[]> {
  const requested = limit + 1;
  if (options.cursorPage) {
    return fetchPage({
      take: requested,
      ...(options.cursorId === undefined ? {} : { cursorId: options.cursorId }),
      includeCursor: true,
    });
  }
  if (requested <= REPORTING_DB_PAGE_SIZE) {
    return fetchPage({ take: requested, includeCursor: false });
  }

  const rows: Record<string, unknown>[] = [];
  let cursorId: string | undefined;
  while (rows.length < requested) {
    const take = Math.min(REPORTING_DB_PAGE_SIZE, requested - rows.length);
    const page = await fetchPage({
      take,
      ...(cursorId === undefined ? {} : { cursorId }),
      includeCursor: true,
    });
    if (!page.length) break;
    rows.push(...page.slice(0, requested - rows.length));
    if (page.length < take || rows.length >= requested) break;

    const nextCursorId = page[page.length - 1]?.id;
    if (typeof nextCursorId !== "string" || nextCursorId === cursorId) {
      throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
    }
    cursorId = nextCursorId;
  }
  return rows;
}

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
  limit: number,
  includeCursor = false,
): { rows: readonly Record<string, unknown>[]; reachedLimit: boolean; nextCursor?: string } {
  const cursorId = includeCursor && rows.length > limit ? rows[limit - 1]?.id : undefined;
  return {
    rows: rows
      .slice(0, limit)
      .map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
    reachedLimit: rows.length > limit,
    ...(typeof cursorId === "string" ? { nextCursor: cursorId } : {}),
  };
}

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
    cursorId?: string;
    cursorPage?: boolean;
    organizationId: string;
    source: FiscalIcmsReportingSource | FiscalNcmReportingSource | FiscalIpiReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const needsPagedSnapshot = input.cursorPage || input.limit + 1 > REPORTING_DB_PAGE_SIZE;
    if ((input.query || needsPagedSnapshot) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        {
          loadPage: (fields, limit, cursorId) =>
            this.extract({
              ...input,
              query: undefined,
              fields,
              limit,
              cursorId,
              cursorPage: true,
            }),
        },
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
    const rows = await readReportingRows(
      input.limit,
      { cursorId: input.cursorId, cursorPage: input.cursorPage },
      (page) =>
        delegate.findMany({
          where: { organization_id: input.organizationId },
          select: Object.fromEntries(
            [...input.fields, ...(page.includeCursor ? ["id"] : [])].map((field) => [field, true]),
          ),
          ...reportingPageOptions(page),
        }),
    );

    return projectRows(rows, input.fields, input.limit, input.cursorPage);
  }
}
