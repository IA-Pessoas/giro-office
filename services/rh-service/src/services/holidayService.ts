import {
  assertNonEmptyString,
  error as logError,
  ServiceError,
  TimeUtils,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const HOLIDAY_SELECT = {
  id: true,
  name: true,
  date: true,
  organization_id: true,
} as const;

export type HolidaySnapshot = Prisma.HolidaysGetPayload<{
  select: typeof HOLIDAY_SELECT;
}>;

export interface HolidayCreateInput {
  organization_id: string;
  name: string;
  date: Date;
}

export interface HolidayUpdateInput {
  id: string;
  organization_id: string;
  name: string;
  date: Date;
}

export interface HolidayDeleteInput {
  id: string;
  organization_id: string;
}

class HolidayService {
  private async findDuplicateInOrgDay(
    organizationId: string,
    referenceDate: Date,
    excludeId?: string,
  ): Promise<HolidaySnapshot | null> {
    const { dayStart, dayEnd } = TimeUtils.getUtcDayBounds(referenceDate);
    return prismaClient.holidays.findFirst({
      where: {
        organization_id: organizationId,
        date: { gte: dayStart, lte: dayEnd },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: HOLIDAY_SELECT,
    });
  }

  async create(input: HolidayCreateInput): Promise<HolidaySnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const name = assertNonEmptyString(input.name, "name");
      if (Number.isNaN(input.date.getTime())) {
        throw new ServiceError(400, "date inválido.");
      }

      const duplicate = await this.findDuplicateInOrgDay(organizationId, input.date);
      if (duplicate) {
        throw new ServiceError(
          409,
          `Já existe um feriado cadastrado nesta data: ${duplicate.name}`,
        );
      }

      const created = await prismaClient.holidays.create({
        data: {
          name,
          date: input.date,
          organization_id: organizationId,
        },
        select: HOLIDAY_SELECT,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar feriado", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar feriado. ${msg}`, err);
    }
  }

  async update(input: HolidayUpdateInput): Promise<HolidaySnapshot> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const name = assertNonEmptyString(input.name, "name");
      if (Number.isNaN(input.date.getTime())) {
        throw new ServiceError(400, "date inválido.");
      }

      const existing = await prismaClient.holidays.findFirst({
        where: { id, organization_id: organizationId },
        select: HOLIDAY_SELECT,
      });

      if (!existing) {
        throw new ServiceError(404, "Feriado não encontrado.");
      }

      const duplicate = await this.findDuplicateInOrgDay(organizationId, input.date, id);
      if (duplicate) {
        throw new ServiceError(
          409,
          `Já existe um feriado cadastrado nesta data: ${duplicate.name}`,
        );
      }

      const updated = await prismaClient.holidays.update({
        where: { id },
        data: { name, date: input.date },
        select: HOLIDAY_SELECT,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar feriado", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao atualizar feriado. ${msg}`, err);
    }
  }

  async list(organizationId: string): Promise<HolidaySnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      return await prismaClient.holidays.findMany({
        where: { organization_id: orgId },
        orderBy: { date: "asc" },
        select: HOLIDAY_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao listar feriados", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar feriados. ${msg}`, err);
    }
  }

  async delete(input: HolidayDeleteInput): Promise<{ message: string }> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const result = await prismaClient.holidays.deleteMany({
        where: { id, organization_id: organizationId },
      });

      if (result.count === 0) {
        throw new ServiceError(404, "Feriado não encontrado.");
      }

      return { message: "Feriado removido com sucesso" };
    } catch (err: unknown) {
      logError("Erro ao excluir feriado", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao excluir feriado. ${msg}`, err);
    }
  }
}

export { HolidayService };
