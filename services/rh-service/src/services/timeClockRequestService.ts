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
        throw new ServiceError(400, "clock_in inválido.");
      }
      if (Number.isNaN(input.lunch_out.getTime())) {
        throw new ServiceError(400, "lunch_out inválido.");
      }
      if (Number.isNaN(input.lunch_in.getTime())) {
        throw new ServiceError(400, "lunch_in inválido.");
      }
      if (Number.isNaN(input.clock_out.getTime())) {
        throw new ServiceError(400, "clock_out inválido.");
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
        throw new ServiceError(404, "Registro de ponto não encontrado.");
      }
      if (point.user_id !== userId) {
        throw new ServiceError(403, "Só é possível solicitar ajuste para o próprio ponto.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organização.");
      }

      const created = await prismaClient.timeClockRequest.create({
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

      return created;
    } catch (err: unknown) {
      logError("Erro ao criar solicitação de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao criar solicitação de ajuste. ${msg}`, err);
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
        throw new ServiceError(404, "Solicitação não encontrada.");
      }
      if (request.organization_id !== organizationId) {
        throw new ServiceError(403, "Solicitação pertence a outra organização.");
      }
      if (request.status !== "Pendente") {
        throw new ServiceError(409, "Solicitação não está pendente de aprovação.");
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
        throw new ServiceError(404, "Registro de ponto vinculado não encontrado.");
      }
      if (point.organization_id !== organizationId) {
        throw new ServiceError(403, "Registro de ponto pertence a outra organização.");
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

      const updated = await prismaClient.timeClockRequest.update({
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

      return updated;
    } catch (err: unknown) {
      logError("Erro ao aprovar solicitação de ajuste de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao aprovar solicitação. ${msg}`, err);
    }
  }
}

export { TimeClockRequestService };
