import { error as logError, ServiceError, TimeUtils } from "@workspace/shared";
import { getRhEnv } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { expectedMinutesFromPointConfig } from "../utils/rhPointTimeUtils.js";

const { pointMinIntervalMinutes } = getRhEnv();

export interface RegisterPointInput {
  user_id: string;
  organization_id: string;
}

export interface PointListFilters {
  user_id?: string;
  date_from?: Date;
  date_to?: Date;
}

export interface TodayPointInput {
  user_id: string;
  organization_id: string;
}

export interface MonthlySummaryInput {
  user_id: string;
  organization_id: string;
  month: string;
}

export type RegisterPointAction = "Entrada" | "Saída almoço" | "Volta almoço" | "Saída";

export type CalculateDailyHoursResult = {
  point_id: string;
  total_worked_minutes: number;
  expected_minutes: number;
  day_balance_minutes: number;
};

const POINT_SELECT = {
  id: true,
  user_id: true,
  organization_id: true,
  clock_in: true,
  lunch_out: true,
  lunch_in: true,
  clock_out: true,
  workload_hours: true,
  time_bank_balance: true,
  signature: true,
} as const;

export type PointSnapshot = Prisma.PointGetPayload<{ select: typeof POINT_SELECT }>;
export type PointListItem = PointSnapshot & { status: string };

export type RegisterPointResult = {
  action: RegisterPointAction;
  point: PointSnapshot;
};

export type TodayPointResult = {
  point: PointSnapshot | null;
  next_action: RegisterPointAction | null;
  is_complete: boolean;
  has_clock_in: boolean;
  has_lunch_out: boolean;
  has_lunch_in: boolean;
  has_clock_out: boolean;
};

export type MonthlySummaryResult = {
  month: string;
  user_id: string;
  total_worked_minutes: number;
  expected_minutes: number;
  balance_minutes: number;
  overtime_minutes: number;
  absence_days: number;
  pending_adjustments: number;
};

function pointStatus(point: PointSnapshot): string {
  if (point.clock_out) {
    return "Completo";
  }
  if (point.lunch_out && !point.lunch_in) {
    return "Em almoço";
  }
  return "Em andamento";
}

function nextActionFromPoint(point: PointSnapshot | null): RegisterPointAction | null {
  if (!point) {
    return "Entrada";
  }
  if (point.clock_out) {
    return null;
  }
  if (!point.lunch_out) {
    return "Saída almoço";
  }
  if (!point.lunch_in) {
    return "Volta almoço";
  }
  return "Saída";
}

function parseMonthBounds(month: string): { monthStart: Date; monthEnd: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) {
    throw new ServiceError(400, "month deve estar no formato YYYY-MM.");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  return {
    monthStart: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    monthEnd: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
  };
}

class PointService {
  async registerPoint(input: RegisterPointInput): Promise<RegisterPointResult> {
    try {
      if (!input.user_id?.trim()) {
        throw new ServiceError(400, "user_id e obrigatorio.");
      }
      if (!input.organization_id?.trim()) {
        throw new ServiceError(400, "organization_id e obrigatorio.");
      }

      const now = new Date();
      const { dayStart, dayEnd } = TimeUtils.getUtcDayBounds(now);

      const existing = await prismaClient.point.findFirst({
        where: {
          user_id: input.user_id,
          organization_id: input.organization_id,
          clock_in: { gte: dayStart, lte: dayEnd },
        },
        select: POINT_SELECT,
      });

      const assertMinInterval = (last: Date) => {
        if (TimeUtils.diffMinutes(last, now) < pointMinIntervalMinutes) {
          throw new ServiceError(
            400,
            `Intervalo minimo de ${pointMinIntervalMinutes} minutos entre registros nao respeitado.`,
          );
        }
      };

      if (!existing) {
        const created = await prismaClient.point.create({
          data: {
            user_id: input.user_id,
            organization_id: input.organization_id,
            clock_in: now,
          },
          select: POINT_SELECT,
        });
        return { action: "Entrada", point: created };
      }

      if (existing.clock_out) {
        throw new ServiceError(400, "Jornada do dia ja concluida.");
      }

      if (!existing.lunch_out) {
        assertMinInterval(existing.clock_in);
        const updated = await prismaClient.point.update({
          where: { id: existing.id },
          data: { lunch_out: now },
          select: POINT_SELECT,
        });
        return { action: "Saída almoço", point: updated };
      }

      if (!existing.lunch_in) {
        assertMinInterval(existing.lunch_out);
        const updated = await prismaClient.point.update({
          where: { id: existing.id },
          data: { lunch_in: now },
          select: POINT_SELECT,
        });
        return { action: "Volta almoço", point: updated };
      }

      assertMinInterval(existing.lunch_in);
      const closed = await prismaClient.point.update({
        where: { id: existing.id },
        data: { clock_out: now },
        select: POINT_SELECT,
      });

      await this.calculateDailyHours(closed.id, input.organization_id);

      const afterCalc = await prismaClient.point.findUniqueOrThrow({
        where: { id: closed.id },
        select: POINT_SELECT,
      });

      return { action: "Saída", point: afterCalc };
    } catch (err: unknown) {
      logError("Erro ao registrar ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao registrar ponto. ${msg}`, err);
    }
  }

  async calculateDailyHours(
    pointId: string,
    organizationId: string,
    db: Pick<Prisma.TransactionClient, "point" | "pointsConfig" | "holidays"> = prismaClient,
  ): Promise<CalculateDailyHoursResult> {
    try {
      if (!pointId?.trim()) {
        throw new ServiceError(400, "point_id e obrigatorio.");
      }
      if (!organizationId?.trim()) {
        throw new ServiceError(400, "organization_id e obrigatorio.");
      }

      const point = await db.point.findUnique({
        where: { id: pointId },
        select: {
          id: true,
          user_id: true,
          organization_id: true,
          clock_in: true,
          lunch_out: true,
          lunch_in: true,
          clock_out: true,
        },
      });

      if (!point) {
        throw new ServiceError(404, "Registro de ponto nao encontrado.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organizacao.");
      }
      if (!point.clock_in || !point.clock_out) {
        throw new ServiceError(400, "Registro incompleto para calculo (exige entrada e saida).");
      }
      if (!point.lunch_out || !point.lunch_in) {
        throw new ServiceError(
          400,
          "Registro incompleto para calculo (intervalo de almoco ausente).",
        );
      }

      const config = await db.pointsConfig.findUnique({
        where: { user_id: point.user_id },
        select: {
          organization_id: true,
          start_time: true,
          lunch_break: true,
          lunch_return: true,
          end_time: true,
          work_days: true,
        },
      });

      if (!config) {
        throw new ServiceError(400, "Configuracao de ponto nao encontrada para o usuario.");
      }
      if (config.organization_id !== organizationId) {
        throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
      }

      const { dayStart, dayEnd } = TimeUtils.getUtcDayBounds(point.clock_in);
      const holiday = await db.holidays.findFirst({
        where: {
          organization_id: organizationId,
          date: { gte: dayStart, lte: dayEnd },
        },
        select: { id: true },
      });

      let expectedMinutes = 0;
      if (holiday) {
        expectedMinutes = 0;
      } else if (!TimeUtils.isWorkDayUtc(config.work_days, point.clock_in)) {
        expectedMinutes = 0;
      } else {
        expectedMinutes = expectedMinutesFromPointConfig(config);
      }

      const morningWorked = TimeUtils.diffMinutes(point.clock_in, point.lunch_out);
      const afternoonWorked = TimeUtils.diffMinutes(point.lunch_in, point.clock_out);
      const totalWorkedMinutes = morningWorked + afternoonWorked;
      const dayBalance = totalWorkedMinutes - expectedMinutes;

      await db.point.update({
        where: { id: point.id },
        data: {
          workload_hours: totalWorkedMinutes,
          time_bank_balance: dayBalance,
        },
      });

      await db.pointsConfig.update({
        where: { user_id: point.user_id },
        data: {
          bank_balance: { increment: dayBalance },
        },
      });

      return {
        point_id: point.id,
        total_worked_minutes: totalWorkedMinutes,
        expected_minutes: expectedMinutes,
        day_balance_minutes: dayBalance,
      };
    } catch (err: unknown) {
      logError("Erro ao calcular horas do ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao calcular horas do ponto. ${msg}`, err);
    }
  }

  async listPoints(organizationId: string, filters: PointListFilters): Promise<PointListItem[]> {
    try {
      if (!organizationId?.trim()) {
        throw new ServiceError(400, "organization_id e obrigatorio.");
      }

      const clockInFilter: Prisma.DateTimeFilter = {};
      if (filters.date_from !== undefined) {
        if (Number.isNaN(filters.date_from.getTime())) {
          throw new ServiceError(400, "date_from invalido.");
        }
        clockInFilter.gte = TimeUtils.getUtcDayBounds(filters.date_from).dayStart;
      }
      if (filters.date_to !== undefined) {
        if (Number.isNaN(filters.date_to.getTime())) {
          throw new ServiceError(400, "date_to invalido.");
        }
        clockInFilter.lte = TimeUtils.getUtcDayBounds(filters.date_to).dayEnd;
      }

      const where: Prisma.PointWhereInput = {
        organization_id: organizationId,
      };
      if (filters.user_id !== undefined) {
        where.user_id = filters.user_id;
      }
      if (clockInFilter.gte || clockInFilter.lte) {
        where.clock_in = clockInFilter;
      }

      const points = await prismaClient.point.findMany({
        where,
        select: POINT_SELECT,
        orderBy: [{ clock_in: "desc" }, { id: "desc" }],
      });

      return points.map((point) => ({
        ...point,
        status: pointStatus(point),
      }));
    } catch (err: unknown) {
      logError("Erro ao listar registros de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar registros de ponto. ${msg}`, err);
    }
  }

  async getTodayPointForUser(input: TodayPointInput): Promise<TodayPointResult> {
    try {
      if (!input.user_id?.trim()) {
        throw new ServiceError(400, "user_id e obrigatorio.");
      }
      if (!input.organization_id?.trim()) {
        throw new ServiceError(400, "organization_id e obrigatorio.");
      }

      const { dayStart, dayEnd } = TimeUtils.getUtcDayBounds(new Date());
      const point = await prismaClient.point.findFirst({
        where: {
          user_id: input.user_id,
          organization_id: input.organization_id,
          clock_in: { gte: dayStart, lte: dayEnd },
        },
        select: POINT_SELECT,
      });

      const hasClockIn = point !== null;
      const hasLunchOut = point?.lunch_out !== null && point?.lunch_out !== undefined;
      const hasLunchIn = point?.lunch_in !== null && point?.lunch_in !== undefined;
      const hasClockOut = point?.clock_out !== null && point?.clock_out !== undefined;

      return {
        point,
        next_action: nextActionFromPoint(point),
        is_complete: hasClockOut,
        has_clock_in: hasClockIn,
        has_lunch_out: hasLunchOut,
        has_lunch_in: hasLunchIn,
        has_clock_out: hasClockOut,
      };
    } catch (err: unknown) {
      logError("Erro ao buscar ponto do dia", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao buscar ponto do dia. ${msg}`, err);
    }
  }

  async getMonthlySummary(input: MonthlySummaryInput): Promise<MonthlySummaryResult> {
    try {
      if (!input.user_id?.trim()) {
        throw new ServiceError(400, "user_id e obrigatorio.");
      }
      if (!input.organization_id?.trim()) {
        throw new ServiceError(400, "organization_id e obrigatorio.");
      }

      const { monthStart, monthEnd } = parseMonthBounds(input.month);

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

      const [points, holidays, pendingAdjustments] = await Promise.all([
        prismaClient.point.findMany({
          where: {
            user_id: input.user_id,
            organization_id: input.organization_id,
            clock_in: { gte: monthStart, lte: monthEnd },
          },
          select: POINT_SELECT,
          orderBy: [{ clock_in: "asc" }, { id: "asc" }],
        }),
        prismaClient.holidays.findMany({
          where: {
            organization_id: input.organization_id,
            date: { gte: monthStart, lte: monthEnd },
          },
          select: { date: true },
        }),
        prismaClient.timeClockRequest.count({
          where: {
            user_id: input.user_id,
            organization_id: input.organization_id,
            status: "Pendente",
            date: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      const holidayKeys = new Set(
        holidays.map((holiday) => TimeUtils.getUtcDayBounds(holiday.date).dayStart.toISOString()),
      );
      const pointDayKeys = new Set(
        points.map((point) => TimeUtils.getUtcDayBounds(point.clock_in).dayStart.toISOString()),
      );

      let absenceDays = 0;
      let expectedWorkDayCount = 0;
      for (
        let cursor = new Date(monthStart);
        cursor.getTime() <= monthEnd.getTime();
        cursor = new Date(cursor.getTime() + 86_400_000)
      ) {
        const dayKey = TimeUtils.getUtcDayBounds(cursor).dayStart.toISOString();
        if (holidayKeys.has(dayKey)) {
          continue;
        }
        if (!TimeUtils.isWorkDayUtc(config.work_days, cursor)) {
          continue;
        }
        expectedWorkDayCount += 1;
        if (!pointDayKeys.has(dayKey)) {
          absenceDays += 1;
        }
      }

      const expectedMinutesPerDay = expectedMinutesFromPointConfig(config);
      const totalWorkedMinutes = points.reduce(
        (sum, point) => sum + (point.workload_hours ?? 0),
        0,
      );
      const expectedMinutes = expectedWorkDayCount * expectedMinutesPerDay;
      const balanceMinutes = totalWorkedMinutes - expectedMinutes;

      return {
        month: input.month,
        user_id: input.user_id,
        total_worked_minutes: totalWorkedMinutes,
        expected_minutes: expectedMinutes,
        balance_minutes: balanceMinutes,
        overtime_minutes: Math.max(balanceMinutes, 0),
        absence_days: absenceDays,
        pending_adjustments: pendingAdjustments,
      };
    } catch (err: unknown) {
      logError("Erro ao gerar resumo mensal de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao gerar resumo mensal de ponto. ${msg}`, err);
    }
  }
}

export { PointService };
