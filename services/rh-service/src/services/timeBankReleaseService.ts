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

export interface TimeBankSummary {
  user_id: string;
  balance_minutes: number;
  approved_releases_count: number;
  pending_releases_count: number;
}

export interface TimeBankOverview {
  total_pending_releases: number;
  total_approved_releases: number;
  users_with_positive_balance: number;
  users_with_negative_balance: number;
}

class TimeBankReleaseService {
  async create(input: TimeBankReleaseCreateInput): Promise<TimeBankReleaseSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const targetUserId = assertNonEmptyString(input.target_user_id, "user_id");
      const addedByUserId = assertNonEmptyString(input.added_by_user_id, "added_by_user_id");
      const reason = assertNonEmptyString(input.reason, "reason");
      if (Number.isNaN(input.date.getTime())) {
        throw new ServiceError(400, "date invalido.");
      }
      if (!Number.isInteger(input.minutes)) {
        throw new ServiceError(400, "minutes deve ser um numero inteiro.");
      }

      const targetUser = await prismaClient.user.findFirst({
        where: { id: targetUserId, organization_id: organizationId },
        select: { id: true },
      });

      if (!targetUser) {
        throw new ServiceError(404, "Colaborador nao encontrado nesta organizacao.");
      }

      return await prismaClient.timeBankReleases.create({
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
    } catch (err: unknown) {
      logError("Erro ao criar lancamento de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao criar lancamento de banco de horas.", err);
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
        throw new ServiceError(404, "Lancamento nao encontrado.");
      }

      if (release.is_approved) {
        throw new ServiceError(409, "Lancamento ja foi aprovado.");
      }

      const pointsConfig = await prismaClient.pointsConfig.findUnique({
        where: { user_id: release.user_id },
        select: { user_id: true },
      });

      if (!pointsConfig) {
        throw new ServiceError(
          404,
          "Configuracao de ponto nao encontrada para o colaborador; nao e possivel aprovar o lancamento.",
        );
      }

      const updated = await prismaClient.$transaction(async (tx) => {
        await tx.timeBankReleases.update({
          where: { id },
          data: { is_approved: true },
        });

        await tx.pointsConfig.update({
          where: { user_id: release.user_id },
          data: { bank_balance: { increment: release.minutes } },
        });

        return tx.timeBankReleases.findFirstOrThrow({
          where: { id, organization_id: organizationId },
          select: TIME_BANK_RELEASE_SELECT,
        });
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao aprovar lancamento de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao aprovar lancamento de banco de horas.", err);
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
          throw new ServiceError(400, "date_from invalido.");
        }
        dateFilter.gte = TimeUtils.getUtcDayBounds(filters.date_from).dayStart;
      }
      if (filters.date_to !== undefined) {
        if (Number.isNaN(filters.date_to.getTime())) {
          throw new ServiceError(400, "date_to invalido.");
        }
        dateFilter.lte = TimeUtils.getUtcDayBounds(filters.date_to).dayEnd;
      }

      const where: Prisma.TimeBankReleasesWhereInput = {
        organization_id: orgId,
      };
      if (filters.user_id !== undefined) {
        where.user_id = filters.user_id;
      }
      if (filters.is_approved !== undefined) {
        where.is_approved = filters.is_approved;
      }
      if (Object.keys(dateFilter).length > 0) {
        where.date = dateFilter;
      }

      return await prismaClient.timeBankReleases.findMany({
        where,
        select: TIME_BANK_RELEASE_SELECT,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
    } catch (err: unknown) {
      logError("Erro ao listar lancamentos de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao listar lancamentos de banco de horas.", err);
    }
  }

  async getSummary(organizationId: string, userId: string): Promise<TimeBankSummary> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const uid = assertNonEmptyString(userId, "user_id");

      const config = await prismaClient.pointsConfig.findUnique({
        where: { user_id: uid },
        select: { user_id: true, organization_id: true, bank_balance: true },
      });

      if (!config) {
        throw new ServiceError(404, "Configuracao de ponto nao encontrada para o colaborador.");
      }
      if (config.organization_id !== orgId) {
        throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
      }

      const [approvedCount, pendingCount] = await Promise.all([
        prismaClient.timeBankReleases.count({
          where: { organization_id: orgId, user_id: uid, is_approved: true },
        }),
        prismaClient.timeBankReleases.count({
          where: { organization_id: orgId, user_id: uid, is_approved: false },
        }),
      ]);

      return {
        user_id: uid,
        balance_minutes: config.bank_balance,
        approved_releases_count: approvedCount,
        pending_releases_count: pendingCount,
      };
    } catch (err: unknown) {
      logError("Erro ao obter resumo de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao obter resumo de banco de horas.", err);
    }
  }

  async getOverview(organizationId: string): Promise<TimeBankOverview> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const [pendingCount, approvedCount, configs] = await Promise.all([
        prismaClient.timeBankReleases.count({
          where: { organization_id: orgId, is_approved: false },
        }),
        prismaClient.timeBankReleases.count({
          where: { organization_id: orgId, is_approved: true },
        }),
        prismaClient.pointsConfig.findMany({
          where: { organization_id: orgId },
          select: { user_id: true, bank_balance: true },
        }),
      ]);

      return {
        total_pending_releases: pendingCount,
        total_approved_releases: approvedCount,
        users_with_positive_balance: configs.filter((config) => config.bank_balance > 0).length,
        users_with_negative_balance: configs.filter((config) => config.bank_balance < 0).length,
      };
    } catch (err: unknown) {
      logError("Erro ao obter visao agregada de banco de horas", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro interno ao obter visao agregada de banco de horas.", err);
    }
  }
}

export { TimeBankReleaseService };
