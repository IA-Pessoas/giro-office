import {
  assertNonEmptyString,
  error as logError,
  ServiceError,
  TimeUtils,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { expectedMinutesFromPointConfig } from "../utils/rhPointTimeUtils.js";

const TIME_SHEET_SELECT = {
  id: true,
  user_id: true,
  start_time: true,
  end_time: true,
  signature: true,
  status: true,
  reopen_reason: true,
  reopened_at: true,
  reopened_by_user_id: true,
  days: true,
  totals: true,
  organization_id: true,
} as const;

export type TimeSheetSnapshot = Prisma.TimeSheetsGetPayload<{
  select: typeof TIME_SHEET_SELECT;
}>;

export interface TimeSheetDaySnapshot {
  date: string;
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
  worked_minutes: number;
  expected_minutes: number;
  balance_minutes: number;
  status: string;
}

export interface TimeSheetTotals {
  worked_minutes: number;
  expected_minutes: number;
  balance_minutes: number;
  absence_count: number;
}

export type TimeSheetDetail = Omit<TimeSheetSnapshot, "days" | "totals"> & {
  days: TimeSheetDaySnapshot[];
  totals: TimeSheetTotals;
};

export type TimeSheetListItem = Omit<TimeSheetDetail, "days" | "totals" | "organization_id"> & {
  has_details: boolean;
  worked_minutes: number;
  balance_minutes: number;
};

export interface TimeSheetCreateInput {
  organization_id: string;
  user_id: string;
  start_time: Date;
  end_time: Date;
}

export interface TimeSheetListInput {
  organization_id: string;
  user_id: string;
}

export interface TimeSheetDetailInput {
  organization_id: string;
  timesheet_id: string;
}

export interface TimeSheetSignInput {
  organization_id: string;
  timesheet_id: string;
  signer_user_id: string;
  signature: string;
}

export interface TimeSheetReopenInput {
  organization_id: string;
  timesheet_id: string;
  reopened_by_user_id: string;
  reason: string;
}

const ZERO_TOTALS: TimeSheetTotals = {
  worked_minutes: 0,
  expected_minutes: 0,
  balance_minutes: 0,
  absence_count: 0,
};

function normalizeTotals(value: unknown): TimeSheetTotals {
  if (!value || typeof value !== "object") {
    return { ...ZERO_TOTALS };
  }
  const item = value as Partial<Record<keyof TimeSheetTotals, unknown>>;
  return {
    worked_minutes: typeof item.worked_minutes === "number" ? item.worked_minutes : 0,
    expected_minutes: typeof item.expected_minutes === "number" ? item.expected_minutes : 0,
    balance_minutes: typeof item.balance_minutes === "number" ? item.balance_minutes : 0,
    absence_count: typeof item.absence_count === "number" ? item.absence_count : 0,
  };
}

function normalizeDays(value: unknown): TimeSheetDaySnapshot[] {
  return Array.isArray(value) ? (value as TimeSheetDaySnapshot[]) : [];
}

function normalizeSheet(sheet: TimeSheetSnapshot): TimeSheetDetail {
  return {
    ...sheet,
    status: sheet.status ?? (sheet.signature ? "Assinada" : "Gerada"),
    days: normalizeDays(sheet.days),
    totals: normalizeTotals(sheet.totals),
  };
}

function pointWorkedMinutes(point: {
  clock_in: Date;
  lunch_out: Date | null;
  lunch_in: Date | null;
  clock_out: Date | null;
  workload_hours: number | null;
}): number {
  if (point.workload_hours !== null && point.workload_hours !== undefined) {
    return point.workload_hours;
  }
  if (!point.lunch_out || !point.lunch_in || !point.clock_out) {
    return 0;
  }
  return (
    TimeUtils.diffMinutes(point.clock_in, point.lunch_out) +
    TimeUtils.diffMinutes(point.lunch_in, point.clock_out)
  );
}

function dayStatus(input: {
  hasPoint: boolean;
  expectedMinutes: number;
  clockOut: Date | null | undefined;
}): string {
  if (input.hasPoint && input.clockOut) {
    return "Completo";
  }
  if (input.hasPoint) {
    return "Incompleto";
  }
  if (input.expectedMinutes > 0) {
    return "Ausente";
  }
  return "Nao previsto";
}

class TimeSheetService {
  private async buildTimesheetSnapshot(input: TimeSheetCreateInput): Promise<{
    days: TimeSheetDaySnapshot[];
    totals: TimeSheetTotals;
  }> {
    const config = await prismaClient.pointsConfig.findUnique({
      where: { user_id: input.user_id },
      select: {
        user_id: true,
        organization_id: true,
        start_time: true,
        lunch_break: true,
        lunch_return: true,
        end_time: true,
        work_days: true,
      },
    });

    if (!config) {
      throw new ServiceError(404, "Configuracao de ponto nao encontrada para o usuario.");
    }
    if (config.organization_id !== input.organization_id) {
      throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
    }

    const [points, holidays] = await Promise.all([
      prismaClient.point.findMany({
        where: {
          user_id: input.user_id,
          organization_id: input.organization_id,
          clock_in: { gte: input.start_time, lte: input.end_time },
        },
        select: {
          id: true,
          clock_in: true,
          lunch_out: true,
          lunch_in: true,
          clock_out: true,
          workload_hours: true,
          time_bank_balance: true,
        },
        orderBy: [{ clock_in: "asc" }, { id: "asc" }],
      }),
      prismaClient.holidays.findMany({
        where: {
          organization_id: input.organization_id,
          date: { gte: input.start_time, lte: input.end_time },
        },
        select: { date: true },
      }),
    ]);

    const pointsByDay = new Map<string, (typeof points)[number]>();
    for (const point of points) {
      const key = TimeUtils.getUtcDayBounds(point.clock_in).dayStart.toISOString().slice(0, 10);
      if (!pointsByDay.has(key)) {
        pointsByDay.set(key, point);
      }
    }

    const holidayKeys = new Set(
      holidays.map((holiday) =>
        TimeUtils.getUtcDayBounds(holiday.date).dayStart.toISOString().slice(0, 10),
      ),
    );
    const expectedPerDay = expectedMinutesFromPointConfig(config);
    const days: TimeSheetDaySnapshot[] = [];
    const totals: TimeSheetTotals = { ...ZERO_TOTALS };
    const start = TimeUtils.getUtcDayBounds(input.start_time).dayStart;
    const end = TimeUtils.getUtcDayBounds(input.end_time).dayStart;

    for (
      let cursor = new Date(start);
      cursor.getTime() <= end.getTime();
      cursor = new Date(cursor.getTime() + 86_400_000)
    ) {
      const date = cursor.toISOString().slice(0, 10);
      const point = pointsByDay.get(date);
      const expectedMinutes =
        holidayKeys.has(date) || !TimeUtils.isWorkDayUtc(config.work_days, cursor)
          ? 0
          : expectedPerDay;
      const workedMinutes = point ? pointWorkedMinutes(point) : 0;
      const balanceMinutes = workedMinutes - expectedMinutes;

      days.push({
        date,
        clock_in: point?.clock_in.toISOString() ?? null,
        lunch_out: point?.lunch_out?.toISOString() ?? null,
        lunch_in: point?.lunch_in?.toISOString() ?? null,
        clock_out: point?.clock_out?.toISOString() ?? null,
        worked_minutes: workedMinutes,
        expected_minutes: expectedMinutes,
        balance_minutes: balanceMinutes,
        status: dayStatus({
          hasPoint: point !== undefined,
          expectedMinutes,
          clockOut: point?.clock_out,
        }),
      });

      totals.worked_minutes += workedMinutes;
      totals.expected_minutes += expectedMinutes;
      totals.balance_minutes += balanceMinutes;
      if (!point && expectedMinutes > 0) {
        totals.absence_count += 1;
      }
    }

    return { days, totals };
  }

  async create(input: TimeSheetCreateInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");
      if (Number.isNaN(input.start_time.getTime()) || Number.isNaN(input.end_time.getTime())) {
        throw new ServiceError(400, "Datas invalidas.");
      }
      if (input.start_time.getTime() >= input.end_time.getTime()) {
        throw new ServiceError(400, "end_time deve ser posterior a start_time.");
      }

      const duplicate = await prismaClient.timeSheets.findFirst({
        where: {
          organization_id: organizationId,
          user_id: userId,
          start_time: input.start_time,
          end_time: input.end_time,
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ServiceError(409, "Folha ja gerada para este periodo.");
      }

      const snapshot = await this.buildTimesheetSnapshot({
        organization_id: organizationId,
        user_id: userId,
        start_time: input.start_time,
        end_time: input.end_time,
      });

      return await prismaClient.timeSheets.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          start_time: input.start_time,
          end_time: input.end_time,
          status: "Gerada",
          days: snapshot.days as unknown as Prisma.InputJsonValue,
          totals: snapshot.totals as unknown as Prisma.InputJsonValue,
        },
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao criar folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar folha de ponto. ${msg}`, err);
    }
  }

  async list(input: TimeSheetListInput): Promise<TimeSheetListItem[]> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");

      const sheets = await prismaClient.timeSheets.findMany({
        where: { organization_id: organizationId, user_id: userId },
        orderBy: { start_time: "desc" },
        select: TIME_SHEET_SELECT,
      });

      return sheets.map((sheet) => {
        const detail = normalizeSheet(sheet);
        return {
          id: detail.id,
          user_id: detail.user_id,
          start_time: detail.start_time,
          end_time: detail.end_time,
          signature: detail.signature,
          status: detail.status,
          reopen_reason: detail.reopen_reason,
          reopened_at: detail.reopened_at,
          reopened_by_user_id: detail.reopened_by_user_id,
          has_details: detail.days.length > 0 || sheet.totals !== null,
          worked_minutes: detail.totals.worked_minutes,
          balance_minutes: detail.totals.balance_minutes,
        };
      });
    } catch (err: unknown) {
      logError("Erro ao listar folhas de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar folhas de ponto. ${msg}`, err);
    }
  }

  async getById(input: TimeSheetDetailInput): Promise<TimeSheetDetail> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const timesheetId = assertNonEmptyString(input.timesheet_id, "timesheet_id");

      const sheet = await prismaClient.timeSheets.findFirst({
        where: { id: timesheetId, organization_id: organizationId },
        select: TIME_SHEET_SELECT,
      });

      if (!sheet) {
        throw new ServiceError(404, "Folha nao encontrada.");
      }

      return normalizeSheet(sheet);
    } catch (err: unknown) {
      logError("Erro ao obter detalhe da folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao obter detalhe da folha de ponto. ${msg}`, err);
    }
  }

  async sign(input: TimeSheetSignInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const timesheetId = assertNonEmptyString(input.timesheet_id, "timesheet_id");
      const signerUserId = assertNonEmptyString(input.signer_user_id, "signer_user_id");
      const signature = assertNonEmptyString(input.signature, "signature");

      const sheet = await prismaClient.timeSheets.findFirst({
        where: { id: timesheetId, organization_id: organizationId },
        select: TIME_SHEET_SELECT,
      });

      if (!sheet) {
        throw new ServiceError(404, "Folha nao encontrada.");
      }

      if (sheet.user_id !== signerUserId) {
        throw new ServiceError(403, "Apenas o colaborador da folha pode assinar.");
      }

      if (sheet.signature) {
        throw new ServiceError(409, "Folha ja assinada.");
      }

      return await prismaClient.timeSheets.update({
        where: { id: timesheetId },
        data: { signature, status: "Assinada" },
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao assinar folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao assinar folha de ponto. ${msg}`, err);
    }
  }

  async reopen(input: TimeSheetReopenInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const timesheetId = assertNonEmptyString(input.timesheet_id, "timesheet_id");
      const reopenedByUserId = assertNonEmptyString(
        input.reopened_by_user_id,
        "reopened_by_user_id",
      );
      const reason = assertNonEmptyString(input.reason, "reason");

      const sheet = await prismaClient.timeSheets.findFirst({
        where: { id: timesheetId, organization_id: organizationId },
        select: TIME_SHEET_SELECT,
      });
      if (!sheet) throw new ServiceError(404, "Folha nao encontrada.");
      if (!sheet.signature && sheet.status !== "Assinada") {
        throw new ServiceError(409, "Folha nao esta assinada.");
      }

      return (await prismaClient.timeSheets.update({
        where: { id: timesheetId },
        data: {
          signature: null,
          status: "Reaberta",
          reopen_reason: reason,
          reopened_at: new Date(),
          reopened_by_user_id: reopenedByUserId,
        } as never,
        select: TIME_SHEET_SELECT,
      })) as TimeSheetSnapshot;
    } catch (err: unknown) {
      logError("Erro ao reabrir folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao reabrir folha de ponto. ${msg}`, err);
    }
  }
}

export { TimeSheetService };
