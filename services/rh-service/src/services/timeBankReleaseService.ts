import {
  assertNonEmptyString,
  error as logError,
  ServiceError,
  TimeUtils,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const TIME_BANK_RELEASE_SELECT = {
  id: true,
  user_id: true,
  date: true,
  minutes: true,
  reason: true,
  is_approved: true,
  added_by_user_id: true,
  organization_id: true,
} as const;

export type TimeBankReleaseSnapshot = Prisma.TimeBankReleasesGetPayload<{
  select: typeof TIME_BANK_RELEASE_SELECT;
}>;

export interface TimeBankReleaseCreateInput {
  organization_id: string;
  target_user_id: string;
  date: Date;
  minutes: number;
  reason: string;
  added_by_user_id: string;
}

export interface TimeBankReleaseApproveInput {
  id: string;
  organization_id: string;
}

export interface TimeBankReleaseListFilters {
  user_id?: string;
  is_approved?: boolean;
  date_from?: Date;
  date_to?: Date;
}

class TimeBankReleaseService {
  async create(input: TimeBankReleaseCreateInput): Promise<TimeBankReleaseSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const targetUserId = assertNonEmptyString(input.target_user_id, "user_id");
      const addedByUserId = assertNonEmptyString(input.added_by_user_id, "added_by_user_id");
      const reason = assertNonEmptyString(input.reason, "reason");
      if (Number.isNaN(input.date.getTime())) {
        throw new ServiceError(400, "date inválido.");
      }
      if (!Number.isInteger(input.minutes)) {
        throw new ServiceError(400, "minutes deve ser um número inteiro.");
      }

      const targetUser = await prismaClient.user.findFirst({
        where: { id: targetUserId, organization_id: organizationId },
        select: { id: true },
      });

      if (!targetUser) {
        throw new ServiceError(404, "Colaborador não encontrado nesta organização.");
      }

      const created = await prismaClient.timeBankReleases.create({
        data: {
          user_id: targetUserId,
          date: input.date,
          minutes: input.minutes,
          reason,
          is_approved: false,
          added_by_user_id: addedByUserId,
          organization_id: organizationId,
        },
        select: TIME_BANK_RELEASE_SELECT,
      });

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar lançamento de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar lançamento de banco de horas.", err);
    }
  }

  async approve(input: TimeBankReleaseApproveInput): Promise<TimeBankReleaseSnapshot> {
    try {
      const id = assertNonEmptyString(input.id, "id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const release = await prismaClient.timeBankReleases.findFirst({
        where: { id, organization_id: organizationId },
        select: TIME_BANK_RELEASE_SELECT,
      });

      if (!release) {
        throw new ServiceError(404, "Lançamento não encontrado.");
      }

      if (release.is_approved) {
        throw new ServiceError(409, "Lançamento já foi aprovado.");
      }

      const pointsConfig = await prismaClient.pointsConfig.findUnique({
        where: { user_id: release.user_id },
        select: { user_id: true },
      });

      if (!pointsConfig) {
        throw new ServiceError(
          404,
          "Configuração de ponto não encontrada para o colaborador; não é possível aprovar o lançamento.",
        );
      }

      const minutesDelta = release.minutes;

      const updated = await prismaClient.$transaction(async (tx) => {
        await tx.timeBankReleases.update({
          where: { id },
          data: { is_approved: true },
        });

        await tx.pointsConfig.update({
          where: { user_id: release.user_id },
          data: { bank_balance: { increment: minutesDelta } },
        });

        return tx.timeBankReleases.findFirstOrThrow({
          where: { id, organization_id: organizationId },
          select: TIME_BANK_RELEASE_SELECT,
        });
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao aprovar lançamento de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao aprovar lançamento de banco de horas.", err);
    }
  }

  async list(
    organizationId: string,
    filters: TimeBankReleaseListFilters,
  ): Promise<TimeBankReleaseSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (filters.date_from !== undefined) {
        if (Number.isNaN(filters.date_from.getTime())) {
          throw new ServiceError(400, "date_from inválido.");
        }
        dateFilter.gte = TimeUtils.getUtcDayBounds(filters.date_from).dayStart;
      }
      if (filters.date_to !== undefined) {
        if (Number.isNaN(filters.date_to.getTime())) {
          throw new ServiceError(400, "date_to inválido.");
        }
        dateFilter.lte = TimeUtils.getUtcDayBounds(filters.date_to).dayEnd;
      }

      return await prismaClient.timeBankReleases.findMany({
        where: {
          organization_id: orgId,
          ...(filters.user_id !== undefined ? { user_id: filters.user_id } : {}),
          ...(filters.is_approved !== undefined ? { is_approved: filters.is_approved } : {}),
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
        select: TIME_BANK_RELEASE_SELECT,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
    } catch (err: unknown) {
      logError("Erro ao listar lançamentos de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao listar lançamentos de banco de horas.", err);
    }
  }
}

export { TimeBankReleaseService };
