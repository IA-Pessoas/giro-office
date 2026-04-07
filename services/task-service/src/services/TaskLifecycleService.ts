import { error as logError, ServiceError } from "@workspace/shared";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import type { IntegracaoTaskConclusionBody } from "../schemas/integracao-task-conclusion-body.schema.js";
import { TaskWorkflowService } from "./TaskWorkflowService.js";

const CONCLUSION_UPDATE_SELECT = {
  id: true,
  status: true,
  prevision_date: true,
  end_date: true,
  responsible_id: true,
  responsible2_id: true,
  responsible3_id: true,
  observations: true,
  justification: true,
  pending_approval: true,
} as const;

const COMPLETE_UPDATE_SELECT = {
  id: true,
  status: true,
  pending_approval: true,
} as const;

export type TaskConclusionRow = TaskGetPayload<{ select: typeof CONCLUSION_UPDATE_SELECT }>;
export type TaskCompleteApprovalRow = TaskGetPayload<{ select: typeof COMPLETE_UPDATE_SELECT }>;

function parseOptionalDate(v: string | Date | null): Date | null {
  if (v === null) {
    return null;
  }
  if (v instanceof Date) {
    return v;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError(400, "Data inválida.");
  }
  return d;
}

export class TaskLifecycleService {
  readonly #workflow = new TaskWorkflowService();

  async concludeTask(params: {
    user_id: string;
    organization_id: string;
    body: IntegracaoTaskConclusionBody;
  }): Promise<TaskConclusionRow> {
    try {
      const { user_id, organization_id, body } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: body.task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const permSpecific = await prismaClient.permissionSpecific.findFirst({
        where: { user_id, organization_id },
      });

      let newStatus = body.status;
      let newPendingApproval = exists.pending_approval ?? false;

      if (body.status === "Concluída") {
        if (!permSpecific || permSpecific.task_completion !== true) {
          newStatus = "Em Andamento";
          newPendingApproval = true;
        }
      }

      const prevision_date =
        body.prevision_date !== undefined
          ? parseOptionalDate(body.prevision_date)
          : exists.prevision_date;
      const end_date =
        body.end_date !== undefined ? parseOptionalDate(body.end_date) : exists.end_date;

      const responsible2_id =
        body.responsible2_id !== undefined ? body.responsible2_id : exists.responsible2_id;
      const responsible3_id =
        body.responsible3_id !== undefined ? body.responsible3_id : exists.responsible3_id;

      const updated = await prismaClient.task.update({
        where: { id: body.task_id },
        data: {
          status: newStatus,
          prevision_date,
          end_date,
          responsible_id: body.responsible_id,
          responsible2_id,
          responsible3_id,
          observations: body.observations,
          justification: body.justification,
          pending_approval: newPendingApproval,
        },
        select: CONCLUSION_UPDATE_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: user_id,
        organizationId: organization_id,
        action: "Conclusão",
        referring: "integracao.tasks",
        referringId: body.task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      if (exists.status !== updated.status) {
        await this.#workflow.afterTaskUpdated({
          taskId: body.task_id,
          projectId: exists.project_id,
          userId: user_id,
          organizationId: organization_id,
          previousStatus: exists.status ?? "",
          newStatus: updated.status ?? "",
          previousBilling: exists.billing ?? "",
        });
      }

      return updated;
    } catch (err: unknown) {
      logError("Erro na conclusão da tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível concluir a tarefa.", err);
    }
  }

  async approveTaskCompletion(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
  }): Promise<TaskCompleteApprovalRow> {
    try {
      const { user_id, organization_id, task_id } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const perm = await prismaClient.permission.findFirst({
        where: { user_id, organization_id },
      });

      if (!perm || perm.integracao !== 2) {
        throw new ServiceError(403, "Sem cargo para completar.");
      }

      const permConclusion = await prismaClient.permissionSpecific.findFirst({
        where: { user_id, organization_id },
      });

      if (!permConclusion || permConclusion.task_completion !== true) {
        throw new ServiceError(403, "Sem permissão para completar.");
      }

      const updated = await prismaClient.task.update({
        where: { id: task_id },
        data: {
          status: "Concluída",
          pending_approval: false,
        },
        select: COMPLETE_UPDATE_SELECT,
      });

      await audit.logUpdateIfChanged({
        userId: user_id,
        organizationId: organization_id,
        action: "Aprovação de Conclusão",
        referring: "integracao.tasks",
        referringId: task_id,
        oldData: exists as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
      });

      if (exists.status !== updated.status) {
        await this.#workflow.afterTaskUpdated({
          taskId: task_id,
          projectId: exists.project_id,
          userId: user_id,
          organizationId: organization_id,
          previousStatus: exists.status ?? "",
          newStatus: updated.status ?? "",
          previousBilling: exists.billing ?? "",
        });
      }

      return updated;
    } catch (err: unknown) {
      logError("Erro na aprovação de conclusão da tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível aprovar a conclusão da tarefa.", err);
    }
  }
}
