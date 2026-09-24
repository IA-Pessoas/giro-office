import { Buffer } from "node:buffer";
import {
  executeReportingQuery,
  MAX_REPORTING_QUERY_BYTES,
  MAX_REPORTING_QUERY_ROWS,
  PESSOAL_LDD_REPORTING_SOURCES,
  PESSOAL_PAYROLL_REPORTING_SOURCES,
  PESSOAL_SITUATIONS_REPORTING_SOURCES,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { NO_OBLIGATIONS_GROUP_POLICY } from "../services/pessoalGroupPolicy.js";
import {
  getPessoalReportingFields,
  PESSOAL_REPORTING_SOURCES,
  type PessoalReportingSource,
} from "./pessoalReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
    cursor?: { id: string };
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type ReportingPage = {
  take: number;
  offset?: number;
  cursorId?: string;
  includeCursor: boolean;
};

type ReportingReadOptions = {
  offset?: number;
  cursorId?: string;
  includeCursor?: boolean;
};

type ReportingRowProjector = (row: Record<string, unknown>) => Record<string, unknown>;

const REPORTING_DB_PAGE_SIZE = 1000;

function reportingPageOptions(page: ReportingPage) {
  if (page.offset !== undefined) {
    return { skip: page.offset, orderBy: { id: "asc" as const }, take: page.take };
  }
  if (!page.includeCursor) return { take: page.take };
  return {
    ...(page.cursorId === undefined ? {} : { cursor: { id: page.cursorId }, skip: 1 }),
    orderBy: { id: "asc" as const },
    take: page.take,
  };
}

function throwSnapshotRowLimit(): never {
  throw new ServiceError(
    422,
    "O conjunto excede a capacidade de consulta do relatório.",
    undefined,
    REPORTING_QUERY_ROW_LIMIT_CODE,
  );
}

function throwSnapshotByteLimit(): never {
  throw new ServiceError(
    422,
    REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
    undefined,
    REPORTING_QUERY_BYTE_LIMIT_CODE,
  );
}

function appendReportingPage(
  rows: Record<string, unknown>[],
  page: readonly Record<string, unknown>[],
  limit: number,
  projectRow: ReportingRowProjector,
  byteSize: number,
  enforceGlobalLimits: boolean,
): number {
  for (const row of page.slice(0, limit + 1 - rows.length)) {
    if (enforceGlobalLimits) {
      if (rows.length >= MAX_REPORTING_QUERY_ROWS) throwSnapshotRowLimit();
      if (rows.length < limit) {
        byteSize +=
          (rows.length ? 1 : 0) + Buffer.byteLength(JSON.stringify(projectRow(row)), "utf8");
        if (byteSize > MAX_REPORTING_QUERY_BYTES) throwSnapshotByteLimit();
      }
    }
    rows.push(row);
  }
  return byteSize;
}

async function readReportingRows(
  limit: number,
  options: ReportingReadOptions,
  fetchPage: (page: ReportingPage) => Promise<readonly Record<string, unknown>[]>,
  projectRow: ReportingRowProjector,
): Promise<readonly Record<string, unknown>[]> {
  const requested = limit + 1;
  const enforceGlobalLimits = options.offset === undefined && !options.includeCursor;
  if (options.offset !== undefined) {
    return fetchPage({ take: requested, offset: options.offset, includeCursor: false });
  }
  if (options.includeCursor) {
    return fetchPage({
      take: requested,
      ...(options.cursorId === undefined ? {} : { cursorId: options.cursorId }),
      includeCursor: true,
    });
  }
  if (requested <= REPORTING_DB_PAGE_SIZE) {
    const page = await fetchPage({ take: requested, includeCursor: false });
    appendReportingPage([], page, limit, projectRow, 2, enforceGlobalLimits);
    return page;
  }

  const rows: Record<string, unknown>[] = [];
  let cursorId: string | undefined;
  let byteSize = 2;
  while (rows.length < requested) {
    const take = Math.min(REPORTING_DB_PAGE_SIZE, requested - rows.length);
    const page = await fetchPage({
      take,
      ...(cursorId === undefined ? {} : { cursorId }),
      includeCursor: true,
    });
    if (page.length === 0) break;
    byteSize = appendReportingPage(rows, page, limit, projectRow, byteSize, enforceGlobalLimits);
    if (page.length < take || rows.length >= requested) break;

    const nextCursorId = page[page.length - 1]?.id;
    if (typeof nextCursorId !== "string" || nextCursorId === cursorId) {
      throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
    }
    cursorId = nextCursorId;
  }
  return rows;
}

const PAYROLL_SCALAR_FIELDS = new Set([
  "advance",
  "advance_type",
  "advance_amount",
  "onvio",
  "vt",
  "vt_value",
  "vt_type",
  "va",
  "assistance_fee",
  "bem_mais",
  "bsf",
  "reinf",
  "employees",
]);

const OBLIGATION_SCALAR_FIELDS = new Set([
  "competence",
  "group_snapshot_name",
  "group_snapshot_policy",
  "advance",
  "payroll",
  "charges",
  "assistance_fee",
  "bem_mais",
  "bsf",
  "va",
  "vt",
]);

function selectScalars(
  fields: readonly string[],
  available: ReadonlySet<string>,
): Record<string, true> {
  return Object.fromEntries(
    fields.filter((field) => available.has(field)).map((field) => [field, true]),
  );
}

function relationName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function reportName(row: Record<string, unknown>, relation: string, field: string): string | null {
  return relationName(row[relation]) ?? textValue(row[field]);
}

function payrollGroupState(row: Record<string, unknown>): string {
  const group = row.group as { archived_at?: unknown; system_key?: unknown } | null | undefined;
  if (group?.system_key === "NO_MOVEMENT") return "SEM_MOVIMENTO";
  if (group?.archived_at != null) return "ARQUIVADO";
  if (group) return "ATIVO";
  return "SEM_GRUPO";
}

function obligationSnapshotState(row: Record<string, unknown>): string {
  if (row.group_snapshot_policy === NO_OBLIGATIONS_GROUP_POLICY) return "SEM_MOVIMENTO";
  return row.group_snapshot_name ? "ATIVO" : "SEM_SNAPSHOT";
}

function projectReportingFields(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => Object.getOwnPropertyDescriptor(row, field) !== undefined)
      .map((field) => [field, row[field]]),
  );
}

function projectPayrollReportingRow(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return projectReportingFields(
    {
      ...row,
      client_name: reportName(row, "client", "client_name"),
      responsible_name: reportName(row, "responsible", "responsible_name"),
      union_name: reportName(row, "union", "union_name"),
      group_name: reportName(row, "group", "group_name"),
      group_state: textValue(row.group_state) ?? payrollGroupState(row),
    },
    fields,
  );
}

function projectObligationReportingRow(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return projectReportingFields(
    {
      ...row,
      client_name: reportName(row, "client", "client_name"),
      responsible_name: reportName(row, "responsible", "responsible_name"),
      group_snapshot_state: textValue(row.group_snapshot_state) ?? obligationSnapshotState(row),
    },
    fields,
  );
}

function projectRows(
  rows: readonly Record<string, unknown>[],
  limit: number,
  projectRow: ReportingRowProjector,
  includeCursor = false,
): { rows: readonly Record<string, unknown>[]; reachedLimit: boolean; nextCursor?: string } {
  const cursorId = includeCursor && rows.length > limit ? rows[limit - 1]?.id : undefined;
  return {
    rows: rows.slice(0, limit).map(projectRow),
    reachedLimit: rows.length > limit,
    ...(typeof cursorId === "string" ? { nextCursor: cursorId } : {}),
  };
}

export class InternalReportingService {
  constructor(
    private readonly prisma: Pick<
      PrismaClient,
      "lddPessoal" | "payroll" | "situationsPessoal" | "obrigationsPessoal" | "unionPessoal"
    >,
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    cursorId?: string;
    cursorPage?: boolean;
    organizationId: string;
    source: PessoalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const needsPagedSnapshot =
      input.offset === undefined && input.limit + 1 > REPORTING_DB_PAGE_SIZE;
    if ((input.query || input.cursorPage || needsPagedSnapshot) && !this.inSnapshot) {
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
              offset: undefined,
              fields,
              limit,
              cursorId,
              cursorPage: true,
            }),
        },
      );
    }
    if (!PESSOAL_REPORTING_SOURCES.includes(input.source)) {
      throw new ServiceError(403, "Fonte não publicada para relatórios.");
    }

    const allowedFields = getPessoalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    if (input.source === PESSOAL_PAYROLL_REPORTING_SOURCES[0]) {
      const projectRow = (row: Record<string, unknown>) =>
        projectPayrollReportingRow(row, input.fields);
      const rows = await readReportingRows(
        input.limit,
        { offset: input.offset, cursorId: input.cursorId, includeCursor: input.cursorPage },
        (page) =>
          this.prisma.payroll.findMany({
            where: { organization_id: input.organizationId },
            select: {
              ...selectScalars(input.fields, PAYROLL_SCALAR_FIELDS),
              ...(page.includeCursor ? { id: true } : {}),
              ...(input.fields.includes("client_name")
                ? { client: { select: { name: true } } }
                : {}),
              ...(input.fields.includes("responsible_name")
                ? { responsible: { select: { name: true } } }
                : {}),
              ...(input.fields.includes("union_name") ? { union: { select: { name: true } } } : {}),
              ...(input.fields.some((field) => field === "group_name" || field === "group_state")
                ? {
                    group: { select: { name: true, archived_at: true, system_key: true } },
                  }
                : {}),
            },
            ...reportingPageOptions(page),
          }),
        projectRow,
      );
      return projectRows(rows, input.limit, projectRow, input.cursorPage);
    }

    if (input.source === "pessoal.obligations") {
      const projectRow = (row: Record<string, unknown>) =>
        projectObligationReportingRow(row, input.fields);
      const rows = await readReportingRows(
        input.limit,
        { offset: input.offset, cursorId: input.cursorId, includeCursor: input.cursorPage },
        (page) =>
          this.prisma.obrigationsPessoal.findMany({
            where: { organization_id: input.organizationId },
            select: {
              ...selectScalars(input.fields, OBLIGATION_SCALAR_FIELDS),
              ...(page.includeCursor ? { id: true } : {}),
              ...(input.fields.includes("client_name")
                ? { client: { select: { name: true } } }
                : {}),
              ...(input.fields.includes("responsible_name")
                ? { responsible: { select: { name: true } } }
                : {}),
            },
            ...reportingPageOptions(page),
          }),
        projectRow,
      );
      return projectRows(rows, input.limit, projectRow, input.cursorPage);
    }

    const delegate =
      input.source === PESSOAL_LDD_REPORTING_SOURCES[0]
        ? this.prisma.lddPessoal
        : input.source === PESSOAL_SITUATIONS_REPORTING_SOURCES[0]
          ? this.prisma.situationsPessoal
          : this.prisma.unionPessoal;
    const reportingDelegate = delegate as unknown as ReportingDelegate;
    const projectRow = (row: Record<string, unknown>) => projectReportingFields(row, input.fields);
    const rows = await readReportingRows(
      input.limit,
      { offset: input.offset, cursorId: input.cursorId, includeCursor: input.cursorPage },
      (page) =>
        reportingDelegate.findMany({
          where: { organization_id: input.organizationId },
          select: {
            ...Object.fromEntries(input.fields.map((field) => [field, true])),
            ...(page.includeCursor ? { id: true } : {}),
          },
          ...reportingPageOptions(page),
        }),
      projectRow,
    );

    return projectRows(rows, input.limit, projectRow, input.cursorPage);
  }
}
