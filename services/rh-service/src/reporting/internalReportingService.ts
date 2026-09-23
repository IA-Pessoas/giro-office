import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  executeReportingQuery,
  MAX_REPORTING_QUERY_BYTES,
  MAX_REPORTING_QUERY_ROWS,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import {
  getRhAttendanceReportingFields,
  type RhAttendanceReportingSource,
} from "./rhAttendanceReportingCatalog.js";
import {
  getRhHolidayReportingFields,
  type RhHolidayReportingSource,
} from "./rhHolidayReportingCatalog.js";
import {
  getRhRequestReportingFields,
  type RhRequestReportingSource,
} from "./rhRequestReportingCatalog.js";

type RhReportingSource =
  | RhRequestReportingSource
  | RhAttendanceReportingSource
  | RhHolidayReportingSource;

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

type ReportGrantUseDelegate = {
  deleteMany(input: { where: { expires_at: { lte: Date } } }): Promise<unknown>;
  create(input: { data: { grant_hash: string; expires_at: Date } }): Promise<unknown>;
};

type AttendanceReportingPrisma = {
  $transaction?: unknown;
  rhRequest?: ReportingDelegate;
  holidays?: ReportingDelegate;
  point?: ReportingDelegate;
  timeSheets?: ReportingDelegate;
  timeBankReleases?: ReportingDelegate;
  timeClockRequest?: ReportingDelegate;
  reportGrantUse?: ReportGrantUseDelegate;
};

type ReportingPage = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
  nextCursor?: string;
};

type AttendanceCursor = { kind: number; id?: string };
type AttendanceKind = "point" | "timeSheets" | "timeBankReleases" | "timeClockRequest";

const REPORTING_DB_PAGE_SIZE = 100;
const attendanceKinds: readonly AttendanceKind[] = [
  "point",
  "timeSheets",
  "timeBankReleases",
  "timeClockRequest",
];

type ReportingSelect = {
  title?: true;
  category?: { select: { name: true } };
  urgency?: true;
  status?: true;
  created_at?: true;
  updated_at?: true;
};

const reportingSelect: ReportingSelect = {
  title: true,
  category: { select: { name: true } },
  urgency: true,
  status: true,
  created_at: true,
  updated_at: true,
};

const holidayReportingSelect = { name: true, date: true } as const;
const attendanceSelects = {
  point: {
    clock_in: true,
    lunch_out: true,
    lunch_in: true,
    clock_out: true,
    workload_hours: true,
    time_bank_balance: true,
  },
  timeSheets: { start_time: true, end_time: true, status: true, totals: true },
  timeBankReleases: { date: true, minutes: true, is_approved: true },
  timeClockRequest: {
    date: true,
    clock_in: true,
    lunch_out: true,
    lunch_in: true,
    clock_out: true,
    status: true,
  },
} satisfies Record<AttendanceKind, Record<string, unknown>>;

function projectRow(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .map((field) => {
        if (field === "category") {
          const category = row.category;
          return [
            field,
            category && typeof category === "object" && "name" in category
              ? (category as { name: unknown }).name
              : undefined,
          ];
        }
        return [field, row[field]];
      })
      .filter(([, value]) => value !== undefined),
  );
}

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) => projectRow(row, fields));
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function throwSnapshotByteLimit(): never {
  throw new ServiceError(
    422,
    REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
    undefined,
    REPORTING_QUERY_BYTE_LIMIT_CODE,
  );
}

function throwSnapshotRowLimit(): never {
  throw new ServiceError(
    422,
    "O conjunto excede a capacidade de consulta do relatório.",
    undefined,
    REPORTING_QUERY_ROW_LIMIT_CODE,
  );
}

function cursorOptions(cursorId?: string) {
  return {
    ...(cursorId === undefined ? {} : { cursor: { id: cursorId }, skip: 1 }),
    orderBy: { id: "asc" as const },
  };
}

function encodeAttendanceCursor(cursor: AttendanceCursor): string {
  return JSON.stringify(cursor);
}

function decodeAttendanceCursor(cursor: string | undefined): AttendanceCursor {
  if (cursor === undefined) return { kind: 0 };
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      typeof parsed.kind === "number" &&
      Number.isInteger(parsed.kind) &&
      parsed.kind >= 0 &&
      parsed.kind < attendanceKinds.length &&
      (!("id" in parsed) || typeof parsed.id === "string")
    ) {
      const cursorValue = parsed as { kind: number; id?: string };
      return {
        kind: cursorValue.kind,
        ...(cursorValue.id === undefined ? {} : { id: cursorValue.id }),
      };
    }
  } catch {
    // A cursor is created and consumed inside this service; malformed cursors indicate an internal error.
  }
  throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
}

async function readReportingRows(
  limit: number,
  fields: readonly string[],
  loadPage: (limit: number, cursor?: string) => Promise<ReportingPage>,
): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
  const requested = limit + 1;
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  let reachedLimit = false;
  let bytes = 2;

  while (rows.length < requested) {
    const pageLimit = Math.min(REPORTING_DB_PAGE_SIZE, requested - rows.length);
    const page = await loadPage(pageLimit, cursor);
    if (!page.rows.length && page.reachedLimit) {
      throw new ServiceError(422, "A origem não conseguiu completar a consulta.");
    }
    for (const row of page.rows) {
      if (rows.length < limit || rows.length >= MAX_REPORTING_QUERY_ROWS) {
        bytes += (rows.length ? 1 : 0) + Buffer.byteLength(JSON.stringify(projectRow(row, fields)));
        if (bytes > MAX_REPORTING_QUERY_BYTES) throwSnapshotByteLimit();
      }
      if (rows.length >= MAX_REPORTING_QUERY_ROWS) throwSnapshotRowLimit();
      rows.push(row);
    }

    reachedLimit = page.reachedLimit;
    if (!page.reachedLimit) break;
    if (rows.length >= requested) break;
    if (!page.nextCursor || page.nextCursor === cursor) {
      throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
    }
    cursor = page.nextCursor;
  }

  return { rows, reachedLimit };
}

export class InternalReportingService {
  constructor(
    private readonly prisma: AttendanceReportingPrisma,
    private readonly inSnapshot = false,
  ) {}

  async consumeGrant(grant: string, expiresAt: number): Promise<void> {
    if (!this.prisma.reportGrantUse) {
      throw new ServiceError(503, "Controle de grants indisponível.");
    }

    await this.prisma.reportGrantUse.deleteMany({
      where: { expires_at: { lte: new Date() } },
    });
    try {
      await this.prisma.reportGrantUse.create({
        data: {
          grant_hash: createHash("sha256").update(grant).digest("hex"),
          expires_at: new Date(expiresAt * 1000),
        },
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ServiceError(403, "Grant de relatórios já utilizado.");
      }
      throw error;
    }
  }

  async extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: RhReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction: AttendanceReportingPrisma) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }

    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        {
          loadPage: (_fields: readonly string[], limit: number, cursor?: string) =>
            this.loadPage(input.organizationId, input.source, limit, cursor),
        },
      );
    }

    const allowedFields =
      input.source === "rh.holidays"
        ? getRhHolidayReportingFields(input.source)
        : input.source === "rh.requests"
          ? getRhRequestReportingFields(input.source)
          : getRhAttendanceReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const result = await readReportingRows(input.limit, input.fields, (limit, cursor) =>
      this.loadPage(input.organizationId, input.source, limit, cursor),
    );
    return {
      rows: projectRows(result.rows.slice(0, input.limit), input.fields),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }

  private async loadPage(
    organizationId: string,
    source: RhReportingSource,
    limit: number,
    cursor?: string,
  ): Promise<ReportingPage> {
    if (source === "rh.attendance") {
      return this.loadAttendancePage(organizationId, limit, cursor);
    }

    const delegate = source === "rh.holidays" ? this.prisma.holidays : this.prisma.rhRequest;
    if (!delegate) {
      throw new ServiceError(
        source === "rh.holidays" ? 500 : 503,
        source === "rh.holidays"
          ? "Fonte de relatórios indisponível."
          : "Fonte de solicitações indisponível.",
      );
    }
    const selectedFields =
      source === "rh.holidays"
        ? { ...holidayReportingSelect, id: true }
        : { ...reportingSelect, id: true };
    const rows = await delegate.findMany({
      where: { organization_id: organizationId },
      select: selectedFields,
      ...cursorOptions(cursor),
      take: limit + 1,
    });
    const visibleRows = rows.slice(0, limit);
    const lastId = visibleRows[visibleRows.length - 1]?.id;
    const reachedLimit = rows.length > limit;
    return {
      rows: visibleRows.map(({ id: _id, ...row }) => row),
      reachedLimit,
      ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
    };
  }

  private async loadAttendancePage(
    organizationId: string,
    limit: number,
    cursor?: string,
  ): Promise<ReportingPage> {
    const state = decodeAttendanceCursor(cursor);
    const rows: Record<string, unknown>[] = [];
    let lastOutputCursor: string | undefined;

    for (let kindIndex = state.kind; kindIndex < attendanceKinds.length; kindIndex++) {
      const kind = attendanceKinds[kindIndex];
      if (!kind) break;
      const remaining = limit - rows.length;
      const rowsForKind = await this.loadAttendanceKind(
        kind,
        organizationId,
        kindIndex === state.kind ? state.id : undefined,
        remaining + 1,
      );
      const visibleRows = rowsForKind.slice(0, remaining);
      const mappedRows = visibleRows.map((row) => this.mapAttendanceRow(kind, row));
      rows.push(...mappedRows.map(({ id: _id, ...row }) => row));
      const lastId = visibleRows[visibleRows.length - 1]?.id;
      if (typeof lastId === "string") {
        lastOutputCursor = encodeAttendanceCursor({ kind: kindIndex, id: lastId });
      }

      if (rowsForKind.length > remaining) {
        if (!lastOutputCursor) {
          throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
        }
        return { rows, reachedLimit: true, nextCursor: lastOutputCursor };
      }
    }

    return { rows, reachedLimit: false };
  }

  private async loadAttendanceKind(
    kind: AttendanceKind,
    organizationId: string,
    cursorId: string | undefined,
    take: number,
  ): Promise<readonly Record<string, unknown>[]> {
    const delegate = this.prisma[kind];
    if (!delegate) throw new ServiceError(503, "Fonte de frequência indisponível.");

    return delegate.findMany({
      where: { organization_id: organizationId },
      select: { ...attendanceSelects[kind], id: true },
      ...cursorOptions(cursorId),
      take,
    });
  }

  private mapAttendanceRow(
    kind: AttendanceKind,
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    if (kind === "point") {
      return {
        id: row.id,
        date: row.clock_in,
        clock_in: row.clock_in,
        lunch_out: row.lunch_out,
        lunch_in: row.lunch_in,
        clock_out: row.clock_out,
        workload_hours: row.workload_hours,
        time_bank_balance: row.time_bank_balance,
        status: row.clock_out
          ? "Completo"
          : row.lunch_out && !row.lunch_in
            ? "Em almoço"
            : "Em andamento",
      };
    }
    if (kind === "timeSheets") {
      const totals = row.totals;
      const normalizedTotals =
        totals && typeof totals === "object" ? (totals as Record<string, unknown>) : {};
      return {
        id: row.id,
        date: row.start_time,
        start_time: row.start_time,
        end_time: row.end_time,
        worked_minutes: numericValue(normalizedTotals.worked_minutes),
        expected_minutes: numericValue(normalizedTotals.expected_minutes),
        balance_minutes: numericValue(normalizedTotals.balance_minutes),
        status: row.status,
      };
    }
    if (kind === "timeBankReleases") {
      return {
        id: row.id,
        date: row.date,
        minutes: row.minutes,
        is_approved: row.is_approved,
        status: row.is_approved ? "Aprovado" : "Pendente",
      };
    }
    return {
      id: row.id,
      date: row.date,
      clock_in: row.clock_in,
      lunch_out: row.lunch_out,
      lunch_in: row.lunch_in,
      clock_out: row.clock_out,
      status: row.status,
    };
  }
}
