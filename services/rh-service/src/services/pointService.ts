import { error as logError, ServiceError } from "@workspace/shared";
import { getRhEnv } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { TimeUtils } from "../utils/timeUtils.js";

const { pointMinIntervalMinutes } = getRhEnv();

export interface RegisterPointInput {
  user_id: string;
  organization_id: string;
}

export type RegisterPointAction = "Entrada" | "Saída almoço" | "Volta almoço" | "Saída";

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

type PointSnapshot = Prisma.PointGetPayload<{ select: typeof POINT_SELECT }>;

class PointService {
  async registerPoint(input: RegisterPointInput): Promise<{
    action: RegisterPointAction;
    point: PointSnapshot;
  }> {
    try {
      if (!input.user_id?.trim()) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }
      if (!input.organization_id?.trim()) {
        throw new ServiceError(400, "organization_id é obrigatório.");
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
            `Intervalo mínimo de ${pointMinIntervalMinutes} minutos entre registros não respeitado.`,
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
        throw new ServiceError(400, "Jornada do dia já concluída.");
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

  async calculateDailyHours(pointId: string, organizationId: string) {
    try {
      if (!pointId?.trim()) {
        throw new ServiceError(400, "point_id é obrigatório.");
      }
      if (!organizationId?.trim()) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const point = await prismaClient.point.findUnique({
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
        throw new ServiceError(404, "Registro de ponto não encontrado.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organização.");
      }
      if (!point.clock_in || !point.clock_out) {
        throw new ServiceError(400, "Registro incompleto para cálculo (exige entrada e saída).");
      }
      if (!point.lunch_out || !point.lunch_in) {
        throw new ServiceError(
          400,
          "Registro incompleto para cálculo (intervalo de almoço ausente).",
        );
      }

      const config = await prismaClient.pointsConfig.findUnique({
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
        throw new ServiceError(400, "Configuração de ponto não encontrada para o usuário.");
      }
      if (config.organization_id !== organizationId) {
        throw new ServiceError(403, "Configuração de ponto pertence a outra organização.");
      }

      const { dayStart, dayEnd } = TimeUtils.getUtcDayBounds(point.clock_in);

      const holiday = await prismaClient.holidays.findFirst({
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
        expectedMinutes = TimeUtils.expectedMinutesFromConfig(config);
      }

      const morningWorked = TimeUtils.diffMinutes(point.clock_in, point.lunch_out);
      const afternoonWorked = TimeUtils.diffMinutes(point.lunch_in, point.clock_out);
      const totalWorkedMinutes = morningWorked + afternoonWorked;

      const dayBalance = totalWorkedMinutes - expectedMinutes;

      await prismaClient.point.update({
        where: { id: point.id },
        data: {
          workload_hours: totalWorkedMinutes,
          time_bank_balance: dayBalance,
        },
      });

      await prismaClient.pointsConfig.update({
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
}

export { PointService };
