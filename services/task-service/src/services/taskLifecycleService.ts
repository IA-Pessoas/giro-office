import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import type { IntegracaoTaskConclusionBody } from "../schemas/integracaoTaskConclusionBody.schema.js";
import { assertResponsibleUsersInDepartment } from "./responsibleUserContext.js";
import { TaskWorkflowService } from "./taskWorkflowService.js";

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
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<TaskConclusionRow> {
    try {
      const { user_id, organization_id, body } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: body.task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      requireIntegracaoRouteAccess("PUT", "/task/conclusion", {
        userId: user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: organization_id,
        resourceOrganizationId: exists.organization_id,
        responsibleId: exists.responsible_id,
        responsible2Id: exists.responsible2_id,
        responsible3Id: exists.responsible3_id,
        isOwner: params.isOwner === true,
        requestedFields: ["status", "observations"],
      });

      const isOwnPatchUnchanged =
        params.isOwner === true ||
        (params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC) >=
          INTEGRACAO_PERMISSION_LEVEL.USER ||
        (body.responsible_id === exists.responsible_id &&
          (body.responsible2_id === undefined || body.responsible2_id === exists.responsible2_id) &&
          (body.responsible3_id === undefined || body.responsible3_id === exists.responsible3_id) &&
          (body.prevision_date === undefined ||
            parseOptionalDate(body.prevision_date)?.getTime() ===
              exists.prevision_date?.getTime()) &&
          (body.end_date === undefined ||
            parseOptionalDate(body.end_date)?.getTime() === exists.end_date?.getTime()));
      if (!isOwnPatchUnchanged) {
        throw new ServiceError(403, "Tarefa própria só permite alterar status e observações.");
      }

      const permSpecific = await prismaClient.permissionSpecific.findFirst({
        where: { user_id, organization_id },
      });

      let newStatus = body.status;
      let newPendingApproval = exists.pending_approval ?? false;
      const level = params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC;

      if (body.status === "Concluída") {
        const canCompleteDirectly =
          (params.isOwner === true || level >= INTEGRACAO_PERMISSION_LEVEL.USER) &&
          permSpecific?.task_completion === true;
        if (!canCompleteDirectly) {
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

      await assertResponsibleUsersInDepartment(
        prismaClient,
        organization_id,
        exists.department_id,
        [
          body.responsible_id !== exists.responsible_id ? body.responsible_id : undefined,
          body.responsible2_id !== undefined && body.responsible2_id !== exists.responsible2_id
            ? body.responsible2_id
            : undefined,
          body.responsible3_id !== undefined && body.responsible3_id !== exists.responsible3_id
            ? body.responsible3_id
            : undefined,
        ],
      );

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
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<TaskCompleteApprovalRow> {
    try {
      const { user_id, organization_id, task_id } = params;

      const exists = await prismaClient.task.findFirst({
        where: { id: task_id, organization_id },
      });

      if (!exists) {
        throw new ServiceError(404, "Tarefa não existe.");
      }

      const permConclusion = await prismaClient.permissionSpecific.findFirst({
        where: { user_id, organization_id },
      });

      requireIntegracaoRouteAccess("PUT", "/task/complete-request", {
        userId: user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: organization_id,
        resourceOrganizationId: exists.organization_id,
        isOwner: params.isOwner === true,
        hasTaskCompletionPermission: permConclusion?.task_completion === true,
      });

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
