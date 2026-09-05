import { createHash } from "node:crypto";

import { ServiceError } from "@workspace/shared";
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

type ReportingSelect = {
  title?: true;
  category?: { select: { name: true } };
  urgency?: true;
  status?: true;
  created_at?: true;
  updated_at?: true;
};

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

type ReportGrantUseDelegate = {
  deleteMany(input: { where: { expires_at: { lte: Date } } }): Promise<unknown>;
  create(input: { data: { grant_hash: string; expires_at: Date } }): Promise<unknown>;
};

type HolidayReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: { name: true; date: true };
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

type AttendanceReportingPrisma = {
  rhRequest?: ReportingDelegate;
  holidays?: HolidayReportingDelegate;
  point?: ReportingDelegate;
  timeSheets?: ReportingDelegate;
  timeBankReleases?: ReportingDelegate;
  timeClockRequest?: ReportingDelegate;
  reportGrantUse?: ReportGrantUseDelegate;
};

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
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
    ),
  );
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const reportingSelect: ReportingSelect = {
  title: true,
  category: { select: { name: true } },
  urgency: true,
  status: true,
  created_at: true,
  updated_at: true,
};

const holidayReportingSelect = { name: true, date: true } as const;

export class InternalReportingService {
  constructor(private readonly prisma: AttendanceReportingPrisma) {}

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
    organizationId: string;
    source: RhReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields =
      input.source === "rh.holidays"
        ? getRhHolidayReportingFields(input.source)
        : input.source === "rh.requests"
          ? getRhRequestReportingFields(input.source)
          : getRhAttendanceReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    if (input.source === "rh.holidays") {
      if (!this.prisma.holidays) {
        throw new ServiceError(500, "Fonte de relatórios indisponível.");
      }
      const rows = await this.prisma.holidays.findMany({
        where: { organization_id: input.organizationId },
        select: holidayReportingSelect,
        take: input.limit + 1,
      });

      return {
        rows: projectRows(rows.slice(0, input.limit), input.fields),
        reachedLimit: rows.length > input.limit,
      };
    }

    if (input.source === "rh.requests") {
      if (!this.prisma.rhRequest) {
        throw new ServiceError(503, "Fonte de solicitações indisponível.");
      }
      const rows = await this.prisma.rhRequest.findMany({
        where: { organization_id: input.organizationId },
        select: reportingSelect,
        take: input.limit + 1,
      });

      return {
        rows: projectRows(rows.slice(0, input.limit), input.fields),
        reachedLimit: rows.length > input.limit,
      };
    }

    const rows = await this.extractAttendanceRows(input.organizationId, input.limit);

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }

  private async extractAttendanceRows(
    organizationId: string,
    limit: number,
  ): Promise<readonly Record<string, unknown>[]> {
    if (
      !this.prisma.point ||
      !this.prisma.timeSheets ||
      !this.prisma.timeBankReleases ||
      !this.prisma.timeClockRequest
    ) {
      throw new ServiceError(503, "Fonte de frequência indisponível.");
    }
    const take = limit + 1;
    const [points, timeSheets, releases, requests] = await Promise.all([
      this.prisma.point.findMany({
        where: { organization_id: organizationId },
        select: {
          clock_in: true,
          lunch_out: true,
          lunch_in: true,
          clock_out: true,
          workload_hours: true,
          time_bank_balance: true,
        },
        take,
      }),
      this.prisma.timeSheets.findMany({
        where: { organization_id: organizationId },
        select: { start_time: true, end_time: true, status: true, totals: true },
        take,
      }),
      this.prisma.timeBankReleases.findMany({
        where: { organization_id: organizationId },
        select: { date: true, minutes: true, is_approved: true },
        take,
      }),
      this.prisma.timeClockRequest.findMany({
        where: { organization_id: organizationId },
        select: {
          date: true,
          clock_in: true,
          lunch_out: true,
          lunch_in: true,
          clock_out: true,
          status: true,
        },
        take,
      }),
    ]);

    return [
      ...points.map((point) => ({
        date: point.clock_in,
        clock_in: point.clock_in,
        lunch_out: point.lunch_out,
        lunch_in: point.lunch_in,
        clock_out: point.clock_out,
        workload_hours: point.workload_hours,
        time_bank_balance: point.time_bank_balance,
        status: point.clock_out
          ? "Completo"
          : point.lunch_out && !point.lunch_in
            ? "Em almoço"
            : "Em andamento",
      })),
      ...timeSheets.map((sheet) => {
        const totals = sheet.totals;
        const normalizedTotals =
          totals && typeof totals === "object" ? (totals as Record<string, unknown>) : {};
        return {
          date: sheet.start_time,
          start_time: sheet.start_time,
          end_time: sheet.end_time,
          worked_minutes: numericValue(normalizedTotals.worked_minutes),
          expected_minutes: numericValue(normalizedTotals.expected_minutes),
          balance_minutes: numericValue(normalizedTotals.balance_minutes),
          status: sheet.status,
        };
      }),
      ...releases.map((release) => ({
        date: release.date,
        minutes: release.minutes,
        is_approved: release.is_approved,
        status: release.is_approved ? "Aprovado" : "Pendente",
      })),
      ...requests.map((request) => ({
        date: request.date,
        clock_in: request.clock_in,
        lunch_out: request.lunch_out,
        lunch_in: request.lunch_in,
        clock_out: request.clock_out,
        status: request.status,
      })),
    ];
  }
}
