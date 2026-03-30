import { error as logError, ServiceError } from "@workspace/shared";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import type { ComercialTaskUpdateBody } from "../schemas/comercial-task-update-body.schema.js";

const CHARGE_COMERCIAL_SELECT = {
  id: true,
  status: true,
  charge_comercial: true,
  charge_financeiro: true,
  hiring_status: true,
  payment: true,
  billing_description: true,
} as const;

export type ChargeComercialRow = TaskGetPayload<{ select: typeof CHARGE_COMERCIAL_SELECT }>;

export class TaskComercialService {
  async updateChargeComercial(params: {
    user_id: string;
    organization_id: string;
    body: ComercialTaskUpdateBody;
  }): Promise<ChargeComercialRow> {
    try {
      const { user_id, organization_id, body } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: body.task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const chargeComercial = body.hiring_status === "A Realizar";
      let chargeFinanceiro = !chargeComercial;

      let status: string;
      if (body.hiring_status === "Não Contratado") {
        status = "Não Contratado";
      } else if (body.hiring_status === "Contratado") {
        status = "Em Andamento";
      } else {
        status = exists.status ?? "";
      }

      if (status === "Não Contratado") {
        chargeFinanceiro = false;
      }

      const updated = await prismaClient.task.update({
        where: { id: body.task_id },
        data: {
          status,
          charge_comercial: chargeComercial,
          charge_financeiro: chargeFinanceiro,
          hiring_status: body.hiring_status,
          payment: body.payment,
          billing_description: body.billing_description,
        },
        select: CHARGE_COMERCIAL_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: user_id,
        organizationId: organization_id,
        action: "Atualização de Cobrança Comercial",
        referring: "integracao.tasks",
        referringId: body.task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      return updated;
    } catch (err: unknown) {
      logError("Erro ao atualizar cobrança comercial", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível atualizar a cobrança comercial.", err);
    }
  }
}
