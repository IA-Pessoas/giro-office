import {
  assertNonEmptyString,
  error as logError,
  ServiceError,
} from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

const TIME_SHEET_SELECT = {
  id: true,
  user_id: true,
  start_time: true,
  end_time: true,
  signature: true,
  organization_id: true,
} as const;

export type TimeSheetSnapshot = Prisma.TimeSheetsGetPayload<{
  select: typeof TIME_SHEET_SELECT;
}>;

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

export interface TimeSheetSignInput {
  organization_id: string;
  timesheet_id: string;
  signer_user_id: string;
  signature: string;
}

class TimeSheetService {
  async create(input: TimeSheetCreateInput): Promise<TimeSheetSnapshot> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");
      if (Number.isNaN(input.start_time.getTime()) || Number.isNaN(input.end_time.getTime())) {
        throw new ServiceError(400, "Datas inválidas.");
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
        throw new ServiceError(409, "Folha já gerada para este período.");
      }

      return await prismaClient.timeSheets.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          start_time: input.start_time,
          end_time: input.end_time,
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

  async list(input: TimeSheetListInput): Promise<TimeSheetSnapshot[]> {
    try {
      const organizationId = assertNonEmptyString(input.organization_id, "organization_id");
      const userId = assertNonEmptyString(input.user_id, "user_id");

      return await prismaClient.timeSheets.findMany({
        where: { organization_id: organizationId, user_id: userId },
        orderBy: { start_time: "desc" },
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao listar folhas de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar folhas de ponto. ${msg}`, err);
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
        throw new ServiceError(404, "Folha não encontrada.");
      }

      if (sheet.user_id !== signerUserId) {
        throw new ServiceError(403, "Apenas o colaborador da folha pode assinar.");
      }

      if (sheet.signature) {
        throw new ServiceError(409, "Folha já assinada.");
      }

      return await prismaClient.timeSheets.update({
        where: { id: timesheetId },
        data: { signature },
        select: TIME_SHEET_SELECT,
      });
    } catch (err: unknown) {
      logError("Erro ao assinar folha de ponto", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao assinar folha de ponto. ${msg}`, err);
    }
  }
}

export { TimeSheetService };
