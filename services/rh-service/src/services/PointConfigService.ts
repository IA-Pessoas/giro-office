import { error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { parseTimeToDate } from "../utils/parseTimeToDate.js";

export interface PointConfigUpsertInput {
  user_id: string;
  organization_id: string;
  start_time: string;
  lunch_break: string;
  lunch_return: string;
  end_time: string;
  work_days?: string;
}

const POINT_CONFIG_SELECT = {
  id: true,
  user_id: true,
  organization_id: true,
  start_time: true,
  lunch_break: true,
  lunch_return: true,
  end_time: true,
  work_days: true,
  bank_balance: true,
  signature: true,
} as const;

export type PointConfigSnapshot = Prisma.PointsConfigGetPayload<{
  select: typeof POINT_CONFIG_SELECT;
}>;

class PointConfigService {
  async upsert(data: PointConfigUpsertInput): Promise<PointConfigSnapshot> {
    try {
      if (!data.user_id?.trim()) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }
      if (!data.organization_id?.trim()) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      let startTime: Date;
      let lunchBreak: Date;
      let lunchReturn: Date;
      let endTime: Date;

      try {
        startTime = parseTimeToDate(data.start_time);
        lunchBreak = parseTimeToDate(data.lunch_break);
        lunchReturn = parseTimeToDate(data.lunch_return);
        endTime = parseTimeToDate(data.end_time);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new ServiceError(400, `Horários inválidos: ${msg}`);
      }

      const existing = await prismaClient.pointsConfig.findUnique({
        where: { user_id: data.user_id },
      });

      if (existing && existing.organization_id !== data.organization_id) {
        throw new ServiceError(403, "Configuração de ponto pertence a outra organização.");
      }

      const workDays = data.work_days?.trim() || "1,2,3,4,5";

      const config = await prismaClient.pointsConfig.upsert({
        where: { user_id: data.user_id },
        update: {
          start_time: startTime,
          lunch_break: lunchBreak,
          lunch_return: lunchReturn,
          end_time: endTime,
          work_days: workDays,
        },
        create: {
          user_id: data.user_id,
          organization_id: data.organization_id,
          start_time: startTime,
          lunch_break: lunchBreak,
          lunch_return: lunchReturn,
          end_time: endTime,
          work_days: workDays,
        },
        select: POINT_CONFIG_SELECT,
      });

      return config;
    } catch (err: unknown) {
      logError("Erro ao upsert point config", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao salvar configuração de ponto. ${msg}`, err);
    }
  }

  async getByUserId(userId: string, organizationId: string): Promise<PointConfigSnapshot | null> {
    try {
      if (!userId?.trim()) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }
      if (!organizationId?.trim()) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const config = await prismaClient.pointsConfig.findFirst({
        where: {
          user_id: userId,
          organization_id: organizationId,
        },
        select: POINT_CONFIG_SELECT,
      });

      return config;
    } catch (err: unknown) {
      logError("Erro ao buscar point config", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao buscar configuração de ponto. ${msg}`, err);
    }
  }
}

export { PointConfigService };
