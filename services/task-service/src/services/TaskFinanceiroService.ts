import { error as logError, ServiceError } from "@workspace/shared";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";

const CHARGE_FINANCEIRO_SELECT = {
  id: true,
  charge_financeiro: true,
} as const;

export type ChargeFinanceiroRow = TaskGetPayload<{ select: typeof CHARGE_FINANCEIRO_SELECT }>;

export class TaskFinanceiroService {
  async updateChargeFinanceiro(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
  }): Promise<ChargeFinanceiroRow> {
    try {
      const { user_id, organization_id, task_id } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const updated = await prismaClient.task.update({
        where: { id: task_id },
        data: {
          charge_financeiro: false,
        },
        select: CHARGE_FINANCEIRO_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: user_id,
        organizationId: organization_id,
        action: "Atualização de Cobrança Financeira",
        referring: "integracao.tasks",
        referringId: task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar cobrança financeira", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar a cobrança financeira.", err);
    }
  }
}
