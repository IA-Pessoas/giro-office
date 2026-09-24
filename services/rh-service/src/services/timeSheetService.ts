import {
  assertNonEmptyString,
  error as logError,
  ServiceError,
  TimeUtils,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import {
  DEFAULT_ORGANIZATION_TIMEZONE,
  holidayDateKey,
  holidayDayBounds,
  organizationDateKey,
  organizationDayBounds,
} from "../utils/rhDateUtils.js";
import { expectedMinutesFromPointConfig } from "../utils/rhPointTimeUtils.js";
import { defaultTimeSheetPeriod } from "../utils/rhTimeSheetPeriod.js";
import { renderTimeSheetPdf } from "./timeSheetPdfService.js";

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
  bank_balance_minutes: number;
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
  start_time?: Date;
  end_time?: Date;
  now?: Date;
}

export interface TimeSheetListInput {
  organization_id: string;
  user_id: string;
}

export interface TimeSheetDetailInput {
  organization_id: string;
  timesheet_id: string;
}

export interface TimeSheetRebuildInput extends TimeSheetDetailInput {}

export interface TimeSheetSignInput {
  organization_id: string;
  timesheet_id: string;
  signer_user_id: string;
  signature?: string;
}

export interface TimeSheetReopenInput {
  organization_id: string;
  timesheet_id: string;
  reopened_by_user_id: string;
  reason: string;
}

export interface TimeSheetPdfInput extends TimeSheetDetailInput {}

const ZERO_TOTALS: TimeSheetTotals = {
  worked_minutes: 0,
  expected_minutes: 0,
  balance_minutes: 0,
  absence_count: 0,
  bank_balance_minutes: 0,
};

function normalizeTotals(value: unknown): TimeSheetTotals {
  if (!value || typeof value !== "object") return { ...ZERO_TOTALS };
  const item = value as Partial<Record<keyof TimeSheetTotals, unknown>>;
  return {
    worked_minutes: typeof item.worked_minutes === "number" ? item.worked_minutes : 0,
    expected_minutes: typeof item.expected_minutes === "number" ? item.expected_minutes : 0,
    balance_minutes: typeof item.balance_minutes === "number" ? item.balance_minutes : 0,
    absence_count: typeof item.absence_count === "number" ? item.absence_count : 0,
    bank_balance_minutes:
      typeof item.bank_balance_minutes === "number" ? item.bank_balance_minutes : 0,
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

function isClosed(sheet: Pick<TimeSheetSnapshot, "signature" | "status">): boolean {
  return Boolean(sheet.signature) || sheet.status === "Assinada";
}

function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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
  if (!point.lunch_out || !point.lunch_in || !point.clock_out) return 0;
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
  if (input.hasPoint && input.clockOut) return "Completo";
  if (input.hasPoint) return "Incompleto";
  if (input.expectedMinutes > 0) return "Ausente";
  return "Nao previsto";
}

type ResolvedTimeSheetInput = {
  organization_id: string;
  user_id: string;
  start_time: Date;
  end_time: Date;
};

class TimeSheetService {
  private async organizationTimezone(organizationId: string): Promise<string> {
    const organizationDelegate = (
      prismaClient as typeof prismaClient & {
        organization?: {
          findUnique: (args: unknown) => Promise<{ timezone?: string | null } | null>;
        };
      }
    ).organization;
    if (!organizationDelegate) return DEFAULT_ORGANIZATION_TIMEZONE;

    const organization = await organizationDelegate.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    if (!organization) throw new ServiceError(404, "Organizacao nao encontrada.");
    return organization.timezone?.trim() || DEFAULT_ORGANIZATION_TIMEZONE;
  }

  private async resolvePeriod(
    input: TimeSheetCreateInput,
    timezone: string,
  ): Promise<ResolvedTimeSheetInput> {
    const hasStart = input.start_time !== undefined;
    const hasEnd = input.end_time !== undefined;
    if (hasStart !== hasEnd) {
      throw new ServiceError(400, "start_time e end_time devem ser informados juntos.");
    }

    const period =
      hasStart && hasEnd
        ? { start_time: input.start_time as Date, end_time: input.end_time as Date }
        : defaultTimeSheetPeriod(input.now, timezone);

    if (Number.isNaN(period.start_time.getTime()) || Number.isNaN(period.end_time.getTime())) {
      throw new ServiceError(400, "Datas invalidas.");
    }
    if (period.start_time.getTime() >= period.end_time.getTime()) {
      throw new ServiceError(400, "end_time deve ser posterior a start_time.");
    }

    return {
      organization_id: assertNonEmptyString(input.organization_id, "organization_id"),
      user_id: assertNonEmptyString(input.user_id, "user_id"),
      ...period,
    };
  }

  private async loadSheet(input: TimeSheetDetailInput): Promise<TimeSheetSnapshot> {
    const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
    const timesheetId = assertNonEmptyString(input.timesheet_id, "timesheet_id");
    const sheet = await prismaClient.timeSheets.findFirst({
      where: { id: timesheetId, organization_id: organizationId },
      select: TIME_SHEET_SELECT,
    });
    if (!sheet) throw new ServiceError(404, "Folha nao encontrada.");
    return sheet;
  }

  private async buildTimesheetSnapshot(
    input: ResolvedTimeSheetInput,
    timezone: string,
  ): Promise<{ days: TimeSheetDaySnapshot[]; totals: TimeSheetTotals }> {
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
        bank_balance: true,
        signature: true,
      },
    });

    if (!config) {
      throw new ServiceError(404, "Configuracao de ponto nao encontrada para o usuario.");
    }
    if (config.organization_id !== input.organization_id) {
      throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
    }

    const periodStart = organizationDayBounds(input.start_time, timezone).start;
    const periodEnd = organizationDayBounds(input.end_time, timezone).end;
    const [points, holidays] = await Promise.all([
      prismaClient.point.findMany({
        where: {
          user_id: input.user_id,
          organization_id: input.organization_id,
          clock_in: { gte: periodStart, lte: periodEnd },
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
          date: {
            gte: holidayDayBounds(input.start_time, timezone).start,
            lte: holidayDayBounds(input.end_time, timezone).end,
          },
        },
        select: { date: true },
      }),
    ]);

    const pointsByDay = new Map<string, (typeof points)[number]>();
    for (const point of points) {
      const key = organizationDateKey(point.clock_in, timezone);
      if (!pointsByDay.has(key)) pointsByDay.set(key, point);
    }

    const holidayKeys = new Set(holidays.map((holiday) => holidayDateKey(holiday.date)));
    const expectedPerDay = expectedMinutesFromPointConfig(config);
    const days: TimeSheetDaySnapshot[] = [];
    const totals: TimeSheetTotals = {
      ...ZERO_TOTALS,
      bank_balance_minutes: config.bank_balance ?? 0,
    };
    const start = organizationDateKey(input.start_time, timezone);
    const end = organizationDateKey(input.end_time, timezone);

    for (let date = start; date <= end; date = nextDateKey(date)) {
      const point = pointsByDay.get(date);
      const weekday = new Date(`${date}T12:00:00.000Z`);
      const expectedMinutes =
        holidayKeys.has(date) || !TimeUtils.isWorkDayUtc(config.work_days, weekday)
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
      if (!point && expectedMinutes > 0) totals.absence_count += 1;
    }

    return { days, totals };
  }

  async create(input: TimeSheetCreateInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const timezone = await this.organizationTimezone(organizationId);
      const resolved = await this.resolvePeriod(input, timezone);
      const duplicate = await prismaClient.timeSheets.findFirst({
        where: {
          organization_id: resolved.organization_id,
          user_id: resolved.user_id,
          start_time: resolved.start_time,
          end_time: resolved.end_time,
        },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Folha ja gerada para este periodo.");

      const snapshot = await this.buildTimesheetSnapshot(resolved, timezone);
      return await prismaClient.timeSheets.create({
        data: {
          organization_id: resolved.organization_id,
          user_id: resolved.user_id,
          start_time: resolved.start_time,
          end_time: resolved.end_time,
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

  async rebuild(input: TimeSheetRebuildInput): Promise<TimeSheetSnapshot> {
    try {
      const sheet = await this.loadSheet(input);
      if (isClosed(sheet)) {
        throw new ServiceError(409, "Folha assinada e imutavel; reabra-a antes de reconstruir.");
      }
      const timezone = await this.organizationTimezone(input.organization_id);
      const snapshot = await this.buildTimesheetSnapshot(
        {
          organization_id: input.organization_id,
          user_id: sheet.user_id,
          start_time: sheet.start_time,
          end_time: sheet.end_time,
        },
        timezone,
      );
      return await prismaClient.timeSheets.update({
        where: { id: sheet.id },
        data: {
          days: snapshot.days as unknown as Prisma.InputJsonValue,
          totals: snapshot.totals as unknown as Prisma.InputJsonValue,
          status: sheet.status === "Reaberta" ? "Reaberta" : "Gerada",
        },
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao reconstruir folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao reconstruir folha de ponto.", err);
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
      throw new ServiceError(500, "Erro interno ao listar folhas de ponto.", err);
    }
  }

  async getById(input: TimeSheetDetailInput): Promise<TimeSheetDetail> {
    try {
      return normalizeSheet(await this.loadSheet(input));
    } catch (err: unknown) {
      logError("Erro ao obter detalhe da folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao obter detalhe da folha de ponto.", err);
    }
  }

  async sign(input: TimeSheetSignInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const signerUserId = assertNonEmptyString(input.signer_user_id, "signer_user_id");
      const sheet = await this.loadSheet({
        organization_id: organizationId,
        timesheet_id: input.timesheet_id,
      });

      if (sheet.user_id !== signerUserId) {
        throw new ServiceError(403, "Apenas o colaborador da folha pode assinar.");
      }
      if (isClosed(sheet)) throw new ServiceError(409, "Folha ja assinada.");

      const timezone = await this.organizationTimezone(organizationId);
      const periodStart = organizationDayBounds(sheet.start_time, timezone).start;
      const periodEnd = organizationDayBounds(sheet.end_time, timezone).end;
      const requestDelegate = (
        prismaClient as typeof prismaClient & {
          timeClockRequest?: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
        }
      ).timeClockRequest;
      const pendingRequest = await requestDelegate?.findFirst({
        where: {
          organization_id: organizationId,
          user_id: sheet.user_id,
          status: "Pendente",
          date: { gte: periodStart, lte: periodEnd },
        },
        select: { id: true },
      });
      if (pendingRequest) {
        throw new ServiceError(409, "Nao e possivel fechar a folha com ajuste de ponto pendente.");
      }

      const pointConfig = await prismaClient.pointsConfig.findUnique({
        where: { user_id: sheet.user_id },
        select: { organization_id: true, signature: true, bank_balance: true },
      });
      if (!pointConfig) {
        throw new ServiceError(404, "Configuracao de ponto nao encontrada para o usuario.");
      }
      if (pointConfig.organization_id !== organizationId) {
        throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
      }

      const signature = pointConfig.signature?.trim() || input.signature?.trim();
      if (!signature) {
        throw new ServiceError(400, "Cadastre uma assinatura ou informe a assinatura da folha.");
      }

      const snapshot = await this.buildTimesheetSnapshot(
        {
          organization_id: organizationId,
          user_id: sheet.user_id,
          start_time: sheet.start_time,
          end_time: sheet.end_time,
        },
        timezone,
      );

      return await prismaClient.$transaction(async (tx) => {
        const pendingReleases = await tx.timeBankReleases.findMany({
          where: {
            organization_id: organizationId,
            user_id: sheet.user_id,
            is_approved: false,
            date: { gte: periodStart, lte: periodEnd },
          },
          select: { id: true, minutes: true },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        });

        let releasedMinutes = 0;
        for (const release of pendingReleases) {
          const claimed = await tx.timeBankReleases.updateMany({
            where: {
              id: release.id,
              organization_id: organizationId,
              user_id: sheet.user_id,
              is_approved: false,
            },
            data: { is_approved: true },
          });
          if (claimed.count === 1) releasedMinutes += release.minutes;
        }

        if (releasedMinutes !== 0) {
          await tx.pointsConfig.update({
            where: { user_id: sheet.user_id },
            data: { bank_balance: { increment: releasedMinutes } },
          });
        }

        const totals = {
          ...snapshot.totals,
          bank_balance_minutes: (pointConfig.bank_balance ?? 0) + releasedMinutes,
        };
        return await tx.timeSheets.update({
          where: { id: sheet.id },
          data: {
            signature,
            status: "Assinada",
            days: snapshot.days as unknown as Prisma.InputJsonValue,
            totals: totals as unknown as Prisma.InputJsonValue,
          },
          select: TIME_SHEET_SELECT,
        });
      });
    } catch (err: unknown) {
      logError("Erro ao assinar folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao assinar folha de ponto.", err);
    }
  }

  async getPdf(input: TimeSheetPdfInput): Promise<{ buffer: Buffer; fileName: string }> {
    try {
      const sheet = await this.getById(input);
      const userDelegate = (
        prismaClient as typeof prismaClient & {
          user?: {
            findFirst: (
              args: unknown,
            ) => Promise<{ name: string; full_name: string | null } | null>;
          };
        }
      ).user;
      const user = await userDelegate?.findFirst({
        where: { id: sheet.user_id, organization_id: sheet.organization_id },
        select: { name: true, full_name: true },
      });
      if (!user) throw new ServiceError(404, "Colaborador da folha nao encontrado.");

      return {
        buffer: await renderTimeSheetPdf({
          employeeName: user.full_name?.trim() || user.name,
          periodStart: sheet.start_time,
          periodEnd: sheet.end_time,
          status: sheet.status,
          days: sheet.days,
          totals: sheet.totals,
          signature: sheet.signature,
        }),
        fileName: `folha-ponto-${sheet.id}.pdf`,
      };
    } catch (err: unknown) {
      logError("Erro ao gerar PDF da folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao gerar PDF da folha de ponto.", err);
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
      const sheet = await this.loadSheet({
        organization_id: organizationId,
        timesheet_id: timesheetId,
      });
      if (!isClosed(sheet)) throw new ServiceError(409, "Folha nao esta assinada.");

      return await prismaClient.timeSheets.update({
        where: { id: timesheetId },
        data: {
          signature: null,
          status: "Reaberta",
          reopen_reason: reason,
          reopened_at: new Date(),
          reopened_by_user_id: reopenedByUserId,
        } as never,
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao reabrir folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao reabrir folha de ponto.", err);
    }
  }
}

export { TimeSheetService };
