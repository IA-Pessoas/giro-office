import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";
import { PointService } from "./pointService.js";

export interface TimeClockRequestCreateInput {
  user_id: string;
  organization_id: string;
  point_id: string;
  clock_in: Date;
  lunch_out: Date;
  lunch_in: Date;
  clock_out: Date;
  justification: string;
  attachment?: string | null;
}

export interface TimeClockRequestApproveInput {
  request_id: string;
  approver_user_id: string;
  organization_id: string;
  obs_approver?: string | null;
}

export interface TimeClockRequestListFilters {
  status?: "Pendente" | "Aprovado";
  user_id?: string;
}

const TIME_CLOCK_REQUEST_SELECT = {
  id: true,
  user_id: true,
  point_id: true,
  clock_in: true,
  lunch_out: true,
  lunch_in: true,
  clock_out: true,
  justification: true,
  attachment: true,
  date: true,
  status: true,
  approver_user_id: true,
  obs_approver: true,
  organization_id: true,
} as const;

export type TimeClockRequestSnapshot = Prisma.TimeClockRequestGetPayload<{
  select: typeof TIME_CLOCK_REQUEST_SELECT;
}>;

class TimeClockRequestService {
  private readonly pointService = new PointService();

  async create(input: TimeClockRequestCreateInput): Promise<TimeClockRequestSnapshot> {
    try {
      const userId = assertNonEmptyString(input.user_id, "user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const pointId = assertNonEmptyString(input.point_id, "point_id");
      const justification = assertNonEmptyString(input.justification, "justification");

      if (Number.isNaN(input.clock_in.getTime())) {
        throw new ServiceError(400, "clock_in invalido.");
      }
      if (Number.isNaN(input.lunch_out.getTime())) {
        throw new ServiceError(400, "lunch_out invalido.");
      }
      if (Number.isNaN(input.lunch_in.getTime())) {
        throw new ServiceError(400, "lunch_in invalido.");
      }
      if (Number.isNaN(input.clock_out.getTime())) {
        throw new ServiceError(400, "clock_out invalido.");
      }

      const point = await prismaClient.point.findUnique({
        where: { id: pointId },
        select: {
          id: true,
          user_id: true,
          organization_id: true,
        },
      });

      if (!point) {
        throw new ServiceError(404, "Registro de ponto nao encontrado.");
      }
      if (point.user_id !== userId) {
        throw new ServiceError(403, "So e possivel solicitar ajuste para o proprio ponto.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organizacao.");
      }

      return await prismaClient.timeClockRequest.create({
        data: {
          user_id: userId,
          organization_id: organizationId,
          point_id: pointId,
          clock_in: input.clock_in,
          lunch_out: input.lunch_out,
          lunch_in: input.lunch_in,
          clock_out: input.clock_out,
          justification,
          attachment: input.attachment?.trim() || null,
          status: "Pendente",
        },
        select: TIME_CLOCK_REQUEST_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao criar solicitacao de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar solicitacao de ajuste. ${msg}`, err);
    }
  }

  async approve(input: TimeClockRequestApproveInput): Promise<TimeClockRequestSnapshot> {
    try {
      const requestId = assertNonEmptyString(input.request_id, "request_id");
      const approverUserId = assertNonEmptyString(input.approver_user_id, "approver_user_id");
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");

      const request = await prismaClient.timeClockRequest.findUnique({
        where: { id: requestId },
        select: TIME_CLOCK_REQUEST_SELECT,
      });

      if (!request) {
        throw new ServiceError(404, "Solicitacao nao encontrada.");
      }
      if (request.organization_id !== organizationId) {
        throw new ServiceError(403, "Solicitacao pertence a outra organizacao.");
      }
      if (request.status !== "Pendente") {
        throw new ServiceError(409, "Solicitacao nao esta pendente de aprovacao.");
      }

      const point = await prismaClient.point.findUnique({
        where: { id: request.point_id },
        select: {
          id: true,
          user_id: true,
          organization_id: true,
          time_bank_balance: true,
        },
      });

      if (!point) {
        throw new ServiceError(404, "Registro de ponto vinculado nao encontrado.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organizacao.");
      }

      if (point.time_bank_balance !== null && point.time_bank_balance !== undefined) {
        await prismaClient.pointsConfig.update({
          where: { user_id: point.user_id },
          data: {
            bank_balance: { decrement: point.time_bank_balance },
          },
        });
      }

      await prismaClient.point.update({
        where: { id: point.id },
        data: {
          clock_in: request.clock_in,
          lunch_out: request.lunch_out,
          lunch_in: request.lunch_in,
          clock_out: request.clock_out,
        },
      });

      await this.pointService.calculateDailyHours(point.id, organizationId);

      return await prismaClient.timeClockRequest.update({
        where: { id: requestId },
        data: {
          status: "Aprovado",
          approver_user_id: approverUserId,
          ...(input.obs_approver !== undefined
            ? {
                obs_approver:
                  input.obs_approver === null ? null : String(input.obs_approver).trim() || null,
              }
            : {}),
        },
        select: TIME_CLOCK_REQUEST_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao aprovar solicitacao de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao aprovar solicitacao. ${msg}`, err);
    }
  }

  async list(
    organizationId: string,
    filters: TimeClockRequestListFilters,
  ): Promise<TimeClockRequestSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");

      const where: Prisma.TimeClockRequestWhereInput = {
        organization_id: orgId,
      };
      if (filters.status !== undefined) {
        where.status = filters.status;
      }
      if (filters.user_id !== undefined) {
        where.user_id = filters.user_id;
      }

      return await prismaClient.timeClockRequest.findMany({
        where,
        select: TIME_CLOCK_REQUEST_SELECT,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
    } catch (err: unknown) {
      logError("Erro ao listar solicitacoes de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar solicitacoes de ajuste. ${msg}`, err);
    }
  }
}

export { TimeClockRequestService };
