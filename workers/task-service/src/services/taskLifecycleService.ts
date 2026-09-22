import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoPermissionLevel,
  error as logError,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { IntegracaoTaskConclusionBody } from "@workspace/task-service/src/schemas/integracaoTaskConclusionBody.schema.js";
import { Prisma } from "../generated/prisma/client.js";
import type { TaskGetPayload } from "../generated/prisma/models/Task.js";
import * as audit from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { assertResponsibleUsersInDepartment } from "./responsibleUserContext.js";
import { throwIfActiveTaskConflict } from "./taskActiveConflict.js";
import {
  publishTaskOperationalNotifications,
  TASK_OPERATIONAL_NOTIFICATION_TYPE,
} from "./taskOperationalNotificationService.js";
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
  date_updated: true,
} as const;

const COMPLETE_UPDATE_SELECT = {
  id: true,
  status: true,
  pending_approval: true,
} as const;

const TASK_COMPLETION_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REFUSED: "refused",
  CANCELED: "canceled",
} as const;

export type TaskConclusionRow = TaskGetPayload<{ select: typeof CONCLUSION_UPDATE_SELECT }>;
export type TaskCompleteApprovalRow = TaskGetPayload<{ select: typeof COMPLETE_UPDATE_SELECT }>;

type TaskConclusionAccessTask = {
  organization_id: string;
  responsible_id: string | null;
  responsible2_id: string | null;
  responsible3_id: string | null;
  prevision_date: Date | null;
  end_date: Date | null;
};

function hasPrismaCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

function assertTaskConclusionAccess(params: {
  userId: string;
  organizationId: string;
  body: IntegracaoTaskConclusionBody;
  level: IntegracaoPermissionLevel;
  isOwner: boolean;
  task: TaskConclusionAccessTask;
}): void {
  requireIntegracaoRouteAccess("PUT", "/task/conclusion", {
    userId: params.userId,
    level: params.level,
    organizationId: params.organizationId,
    resourceOrganizationId: params.task.organization_id,
    responsibleId: params.task.responsible_id,
    responsible2Id: params.task.responsible2_id,
    responsible3Id: params.task.responsible3_id,
    isOwner: params.isOwner,
    requestedFields: ["status", "observations"],
  });

  const isOwnPatchUnchanged =
    params.isOwner ||
    params.level >= INTEGRACAO_PERMISSION_LEVEL.USER ||
    (params.body.responsible_id === params.task.responsible_id &&
      (params.body.responsible2_id === undefined ||
        params.body.responsible2_id === params.task.responsible2_id) &&
      (params.body.responsible3_id === undefined ||
        params.body.responsible3_id === params.task.responsible3_id) &&
      (params.body.end_date === undefined ||
        parseOptionalDate(params.body.end_date)?.getTime() === params.task.end_date?.getTime()));
  if (!isOwnPatchUnchanged) {
    throw new ServiceError(403, "Tarefa própria só permite alterar status e observações.");
  }
}

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

  async requestTaskCompletion(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
    reason: string;
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<{ id: string; status: string }> {
    try {
      const task = await prismaClient.task.findFirst({
        where: { id: params.task_id, organization_id: params.organization_id },
      });
      if (!task) throw new ServiceError(404, "Tarefa não existe.");
      if (task.status === "Concluída") {
        throw new ServiceError(409, "Tarefa já está concluída.");
      }
      requireIntegracaoRouteAccess("POST", "/task/complete-request", {
        userId: params.user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organization_id,
        resourceOrganizationId: task.organization_id,
        responsibleId: task.responsible_id,
        responsible2Id: task.responsible2_id,
        responsible3Id: task.responsible3_id,
        isOwner: params.isOwner === true,
      });

      return await prismaClient.$transaction(
        async (tx) => {
          const currentTask = await tx.task.findFirst({
            where: { id: params.task_id, organization_id: params.organization_id },
          });
          if (!currentTask) throw new ServiceError(404, "Tarefa não existe.");
          if (currentTask.status === "Concluída") {
            throw new ServiceError(409, "Tarefa já está concluída.");
          }
          requireIntegracaoRouteAccess("POST", "/task/complete-request", {
            userId: params.user_id,
            level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
            organizationId: params.organization_id,
            resourceOrganizationId: currentTask.organization_id,
            responsibleId: currentTask.responsible_id,
            responsible2Id: currentTask.responsible2_id,
            responsible3Id: currentTask.responsible3_id,
            isOwner: params.isOwner === true,
          });
          const pending = await tx.taskCompletionRequest.findFirst({
            where: {
              task_id: params.task_id,
              organization_id: params.organization_id,
              status: TASK_COMPLETION_REQUEST_STATUS.PENDING,
            },
          });
          if (pending)
            throw new ServiceError(409, "Já existe uma solicitação de conclusão pendente.");

          const request = await tx.taskCompletionRequest.create({
            data: {
              task_id: params.task_id,
              organization_id: params.organization_id,
              requester_id: params.user_id,
              reason: params.reason,
            },
            select: { id: true, status: true },
          });
          await tx.task.update({
            where: { id: params.task_id },
            data: { pending_approval: true },
          });
          await publishTaskOperationalNotifications(tx, {
            organization_id: params.organization_id,
            task_id: currentTask.id,
            event_key: `completion-request:${request.id}`,
            type: TASK_OPERATIONAL_NOTIFICATION_TYPE.COMPLETION_REQUEST,
            title: "Solicitação de conclusão",
            message: "Uma tarefa foi enviada para sua validação.",
            responsible_ids: [
              currentTask.responsible_id,
              currentTask.responsible2_id,
              currentTask.responsible3_id,
            ],
            exclude_user_id: params.user_id,
          });
          await audit.createLog({
            userId: params.user_id,
            organizationId: params.organization_id,
            action: "Solicitação de Conclusão",
            referring: "integracao.task_completion_requests",
            referringId: request.id,
            changes: {
              task_id: params.task_id,
              status: request.status,
              reason: params.reason,
            },
            required: true,
          });
          return request;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err: unknown) {
      logError("Erro ao solicitar conclusão da tarefa", { err });
      if (err instanceof ServiceError) throw err;
      if (hasPrismaCode(err, "P2002")) {
        throw new ServiceError(409, "Já existe uma solicitação de conclusão pendente.", err);
      }
      if (hasPrismaCode(err, "P2034")) {
        throw new ServiceError(409, "A tarefa foi alterada simultaneamente. Tente novamente.", err);
      }
      throw new ServiceError(500, "Não foi possível solicitar a conclusão da tarefa.", err);
    }
  }

  async cancelTaskCompletion(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
    request_id?: string;
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<{ id: string; status: string }> {
    try {
      const task = await prismaClient.task.findFirst({
        where: { id: params.task_id, organization_id: params.organization_id },
      });
      if (!task) throw new ServiceError(404, "Tarefa não existe.");
      requireIntegracaoRouteAccess("DELETE", "/task/complete-request", {
        userId: params.user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organization_id,
        resourceOrganizationId: task.organization_id,
        responsibleId: task.responsible_id,
        responsible2Id: task.responsible2_id,
        responsible3Id: task.responsible3_id,
        isOwner: params.isOwner === true,
      });

      return await prismaClient.$transaction(async (tx) => {
        const request = await tx.taskCompletionRequest.findFirst({
          where: {
            task_id: params.task_id,
            organization_id: params.organization_id,
            ...(params.request_id ? { id: params.request_id } : { status: "pending" }),
          },
          orderBy: { created_at: "desc" },
        });
        if (!request) throw new ServiceError(404, "Solicitação de conclusão não existe.");
        if (request.requester_id !== params.user_id) {
          throw new ServiceError(403, "Somente o solicitante pode cancelar a conclusão.");
        }
        if (request.status === TASK_COMPLETION_REQUEST_STATUS.CANCELED) {
          return { id: request.id, status: request.status };
        }
        if (request.status !== TASK_COMPLETION_REQUEST_STATUS.PENDING) {
          throw new ServiceError(409, "A solicitação de conclusão já foi encerrada.");
        }

        const canceled = await tx.taskCompletionRequest.updateMany({
          where: { id: request.id, status: TASK_COMPLETION_REQUEST_STATUS.PENDING },
          data: {
            status: TASK_COMPLETION_REQUEST_STATUS.CANCELED,
            decided_by: params.user_id,
            resolved_at: new Date(),
          },
        });
        if (canceled.count === 0) {
          throw new ServiceError(409, "A solicitação de conclusão já foi encerrada.");
        }
        await tx.task.update({
          where: { id: params.task_id },
          data: { pending_approval: false },
        });
        await audit.createLog({
          userId: params.user_id,
          organizationId: params.organization_id,
          action: "Cancelamento de Solicitação de Conclusão",
          referring: "integracao.task_completion_requests",
          referringId: request.id,
          changes: { task_id: params.task_id, status: TASK_COMPLETION_REQUEST_STATUS.CANCELED },
          required: true,
        });
        return { id: request.id, status: TASK_COMPLETION_REQUEST_STATUS.CANCELED };
      });
    } catch (err: unknown) {
      logError("Erro ao cancelar solicitação de conclusão da tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível cancelar a solicitação de conclusão.", err);
    }
  }

  async listTaskCompletionRequests(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<
    Array<{
      id: string;
      requester_id: string;
      status: string;
      reason: string | null;
      decision_reason: string | null;
      decided_by: string | null;
      created_at: Date;
      resolved_at: Date | null;
    }>
  > {
    try {
      const task = await prismaClient.task.findFirst({
        where: { id: params.task_id, organization_id: params.organization_id },
      });
      if (!task) throw new ServiceError(404, "Tarefa não existe.");
      requireIntegracaoRouteAccess("GET", "/task/complete-request/list", {
        userId: params.user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organization_id,
        resourceOrganizationId: task.organization_id,
        responsibleId: task.responsible_id,
        responsible2Id: task.responsible2_id,
        responsible3Id: task.responsible3_id,
        isOwner: params.isOwner === true,
      });
      return prismaClient.taskCompletionRequest.findMany({
        where: { task_id: params.task_id, organization_id: params.organization_id },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          requester_id: true,
          status: true,
          reason: true,
          decision_reason: true,
          decided_by: true,
          created_at: true,
          resolved_at: true,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao listar solicitações de conclusão da tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível listar as solicitações de conclusão.", err);
    }
  }

  async reopenTask(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
    reason: string;
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<TaskCompleteApprovalRow> {
    try {
      const task = await prismaClient.task.findFirst({
        where: { id: params.task_id, organization_id: params.organization_id },
      });
      if (!task) throw new ServiceError(404, "Tarefa não existe.");
      if (task.status !== "Concluída") {
        throw new ServiceError(409, "A tarefa não está concluída.");
      }
      requireIntegracaoRouteAccess("PUT", "/task/reopen", {
        userId: params.user_id,
        level: params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC,
        organizationId: params.organization_id,
        resourceOrganizationId: task.organization_id,
        isOwner: params.isOwner === true,
      });

      const updated = await prismaClient.$transaction(async (tx) => {
        const reopened = await tx.task.update({
          where: { id: params.task_id },
          data: { status: "Em Andamento", pending_approval: false, end_date: null },
          select: COMPLETE_UPDATE_SELECT,
        });
        await publishTaskOperationalNotifications(tx, {
          organization_id: params.organization_id,
          task_id: params.task_id,
          event_key: `task-reopen:${params.task_id}:${Date.now()}`,
          type: TASK_OPERATIONAL_NOTIFICATION_TYPE.TASK_CHANGED,
          title: "Tarefa reaberta",
          message: `A tarefa foi reaberta. Motivo: ${params.reason.trim()}`,
          responsible_ids: [task.responsible_id, task.responsible2_id, task.responsible3_id],
          include_administrators: true,
          exclude_user_id: params.user_id,
        });
        await audit.createLog({
          userId: params.user_id,
          organizationId: params.organization_id,
          action: "Reabertura de Tarefa",
          referring: "integracao.tasks",
          referringId: params.task_id,
          changes: {
            status: "Em Andamento",
            reason: params.reason.trim(),
            responsible_ids: [
              task.responsible_id,
              task.responsible2_id,
              task.responsible3_id,
            ].filter((id): id is string => Boolean(id)),
          },
          required: true,
        });
        return reopened;
      });
      await this.#workflow.afterTaskUpdated({
        taskId: params.task_id,
        projectId: task.project_id,
        userId: params.user_id,
        organizationId: params.organization_id,
        previousStatus: task.status ?? "",
        newStatus: updated.status ?? "",
        previousBilling: task.billing ?? "",
      });
      return updated;
    } catch (err: unknown) {
      logError("Erro ao reabrir tarefa", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível reabrir a tarefa.", err);
    }
  }

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

      const permSpecific = await prismaClient.permissionSpecific.findFirst({
        where: { user_id, organization_id },
      });

      let newStatus = body.status;
      const level = params.integracaoLevel ?? INTEGRACAO_PERMISSION_LEVEL.BASIC;
      const isOwner = params.isOwner === true;
      let requiresCompletionRequest = false;

      if (body.status === "Concluída") {
        const canCompleteDirectly =
          (isOwner || level >= INTEGRACAO_PERMISSION_LEVEL.USER) &&
          permSpecific?.task_completion === true;
        if (!canCompleteDirectly) {
          newStatus = "Em Andamento";
          requiresCompletionRequest = true;
        }
      }

      const { task: updated, previousTask } = await prismaClient.$transaction(
        async (tx) => {
          const currentTask = await tx.task.findFirst({
            where: { id: body.task_id, organization_id },
          });
          if (!currentTask) throw new ServiceError(404, "Tarefa não existe.");
          assertTaskConclusionAccess({
            userId: user_id,
            organizationId: organization_id,
            body,
            level,
            isOwner,
            task: currentTask,
          });

          if (requiresCompletionRequest) {
            if (currentTask.status === "Concluída") {
              throw new ServiceError(409, "Tarefa já está concluída.");
            }
            const pending = await tx.taskCompletionRequest.findFirst({
              where: {
                task_id: body.task_id,
                organization_id,
                status: TASK_COMPLETION_REQUEST_STATUS.PENDING,
              },
            });
            if (pending) {
              throw new ServiceError(409, "Já existe uma solicitação de conclusão pendente.");
            }
          }

          const endDate =
            body.end_date !== undefined ? parseOptionalDate(body.end_date) : currentTask.end_date;
          const responsible2Id =
            body.responsible2_id !== undefined ? body.responsible2_id : currentTask.responsible2_id;
          const responsible3Id =
            body.responsible3_id !== undefined ? body.responsible3_id : currentTask.responsible3_id;
          await assertResponsibleUsersInDepartment(tx, organization_id, currentTask.department_id, [
            body.responsible_id !== currentTask.responsible_id ? body.responsible_id : undefined,
            body.responsible2_id !== undefined &&
            body.responsible2_id !== currentTask.responsible2_id
              ? body.responsible2_id
              : undefined,
            body.responsible3_id !== undefined &&
            body.responsible3_id !== currentTask.responsible3_id
              ? body.responsible3_id
              : undefined,
          ]);

          const task = await tx.task.update({
            where: { id: body.task_id },
            data: {
              status: newStatus,
              prevision_date: currentTask.prevision_date,
              end_date: endDate,
              responsible_id: body.responsible_id,
              responsible2_id: responsible2Id,
              responsible3_id: responsible3Id,
              observations: body.observations,
              justification: body.justification,
              pending_approval:
                requiresCompletionRequest || (currentTask.pending_approval ?? false),
            },
            select: CONCLUSION_UPDATE_SELECT,
          });

          if (requiresCompletionRequest) {
            const request = await tx.taskCompletionRequest.create({
              data: {
                task_id: body.task_id,
                organization_id,
                requester_id: user_id,
                reason: body.justification ?? "",
              },
              select: { id: true, status: true },
            });
            await audit.createLog({
              userId: user_id,
              organizationId: organization_id,
              action: "Solicitação de Conclusão",
              referring: "integracao.task_completion_requests",
              referringId: request.id,
              changes: {
                task_id: body.task_id,
                status: request.status,
                reason: body.justification ?? "",
              },
              required: true,
            });
            await publishTaskOperationalNotifications(tx, {
              organization_id,
              task_id: task.id,
              event_key: `completion-request:${request.id}`,
              type: TASK_OPERATIONAL_NOTIFICATION_TYPE.COMPLETION_REQUEST,
              title: "Solicitação de conclusão",
              message: "Uma tarefa foi enviada para sua validação.",
              responsible_ids: [task.responsible_id, task.responsible2_id, task.responsible3_id],
              exclude_user_id: user_id,
            });
          }

          const relevantChange =
            currentTask.status !== task.status ||
            currentTask.observations !== task.observations ||
            currentTask.end_date?.getTime() !== task.end_date?.getTime() ||
            currentTask.responsible_id !== task.responsible_id ||
            currentTask.responsible2_id !== task.responsible2_id ||
            currentTask.responsible3_id !== task.responsible3_id;
          if (relevantChange && !requiresCompletionRequest) {
            await publishTaskOperationalNotifications(tx, {
              organization_id,
              task_id: task.id,
              event_key: `task-change:${task.date_updated?.toISOString() ?? task.id}`,
              type: TASK_OPERATIONAL_NOTIFICATION_TYPE.TASK_CHANGED,
              title: "Tarefa atualizada",
              message: "Há uma alteração relevante em uma tarefa sob sua responsabilidade.",
              responsible_ids: [task.responsible_id, task.responsible2_id, task.responsible3_id],
              include_administrators: true,
              exclude_user_id: user_id,
            });
          }

          return { task, previousTask: currentTask };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await audit.logUpdateIfChanged({
        userId: user_id,
        organizationId: organization_id,
        action: "Conclusão",
        referring: "integracao.tasks",
        referringId: body.task_id,
        oldData: previousTask as Record<string, unknown>,
        updatedData: updated as Record<string, unknown>,
        required: true,
      });

      if (previousTask.status !== updated.status) {
        await this.#workflow.afterTaskUpdated({
          taskId: body.task_id,
          projectId: previousTask.project_id,
          userId: user_id,
          organizationId: organization_id,
          previousStatus: previousTask.status ?? "",
          newStatus: updated.status ?? "",
          previousBilling: previousTask.billing ?? "",
        });
      }

      return updated;
    } catch (err: unknown) {
      logError("Erro na conclusão da tarefa", { err });
      throwIfActiveTaskConflict(err);
      if (err instanceof ServiceError) throw err;
      if (hasPrismaCode(err, "P2034")) {
        throw new ServiceError(409, "A tarefa foi alterada simultaneamente. Tente novamente.", err);
      }
      throw new ServiceError(500, "Não foi possível concluir a tarefa.", err);
    }
  }

  async approveTaskCompletion(params: {
    user_id: string;
    organization_id: string;
    task_id: string;
    request_id?: string;
    decision?: "approved" | "refused";
    reason?: string;
    integracaoLevel?: IntegracaoPermissionLevel;
    isOwner?: boolean;
  }): Promise<TaskCompleteApprovalRow> {
    try {
      const { user_id, organization_id, task_id } = params;
      const decision = params.decision ?? TASK_COMPLETION_REQUEST_STATUS.APPROVED;
      if (decision === TASK_COMPLETION_REQUEST_STATUS.REFUSED && !params.reason?.trim()) {
        throw new ServiceError(400, "Motivo da recusa é obrigatório.");
      }

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

      const updated = await prismaClient.$transaction(async (tx) => {
        const completionRequest = await tx.taskCompletionRequest.findFirst({
          where: {
            task_id,
            organization_id,
            ...(params.request_id ? { id: params.request_id } : {}),
          },
          orderBy: { created_at: "desc" },
        });

        if (!completionRequest) {
          if (decision === TASK_COMPLETION_REQUEST_STATUS.APPROVED && exists.pending_approval) {
            const legacyUpdated = await tx.task.update({
              where: { id: task_id },
              data: { status: "Concluída", pending_approval: false },
              select: COMPLETE_UPDATE_SELECT,
            });
            await audit.createLog({
              userId: user_id,
              organizationId: organization_id,
              action: "Aprovação de Conclusão",
              referring: "integracao.tasks",
              referringId: task_id,
              changes: { status: "Concluída", legacy_pending_approval: true },
              required: true,
            });
            await publishTaskOperationalNotifications(tx, {
              organization_id,
              task_id,
              event_key: `completion-decision:legacy:${task_id}:${decision}`,
              type: TASK_OPERATIONAL_NOTIFICATION_TYPE.COMPLETION_DECISION,
              title: "Conclusão aprovada",
              message: "A conclusão da tarefa foi aprovada.",
              responsible_ids: [
                exists.responsible_id,
                exists.responsible2_id,
                exists.responsible3_id,
              ],
              exclude_user_id: user_id,
            });
            return legacyUpdated;
          }
          throw new ServiceError(409, "Não há solicitação de conclusão pendente.");
        }

        if (completionRequest.status !== TASK_COMPLETION_REQUEST_STATUS.PENDING) {
          if (completionRequest.status !== decision) {
            throw new ServiceError(409, "A solicitação de conclusão já foi encerrada.");
          }
          return tx.task.findFirstOrThrow({
            where: { id: task_id, organization_id },
            select: COMPLETE_UPDATE_SELECT,
          });
        }

        const resolved = await tx.taskCompletionRequest.updateMany({
          where: { id: completionRequest.id, status: TASK_COMPLETION_REQUEST_STATUS.PENDING },
          data: {
            status: decision,
            decision_reason:
              decision === TASK_COMPLETION_REQUEST_STATUS.REFUSED ? params.reason?.trim() : null,
            decided_by: user_id,
            resolved_at: new Date(),
          },
        });
        if (resolved.count === 0) {
          const concurrentRequest = await tx.taskCompletionRequest.findFirst({
            where: { id: completionRequest.id, organization_id },
          });
          if (concurrentRequest?.status === decision) {
            return tx.task.findFirstOrThrow({
              where: { id: task_id, organization_id },
              select: COMPLETE_UPDATE_SELECT,
            });
          }
          throw new ServiceError(409, "A solicitação de conclusão já foi encerrada.");
        }

        const approved = decision === TASK_COMPLETION_REQUEST_STATUS.APPROVED;
        const task = await tx.task.update({
          where: { id: task_id },
          data: {
            status: approved ? "Concluída" : "Em Andamento",
            pending_approval: false,
            end_date: approved ? new Date() : null,
          },
          select: COMPLETE_UPDATE_SELECT,
        });
        await audit.createLog({
          userId: user_id,
          organizationId: organization_id,
          action:
            decision === TASK_COMPLETION_REQUEST_STATUS.APPROVED
              ? "Aprovação de Conclusão"
              : "Recusa de Conclusão",
          referring: "integracao.task_completion_requests",
          referringId: completionRequest.id,
          changes: {
            task_id,
            status: decision,
            ...(params.reason?.trim() ? { reason: params.reason.trim() } : {}),
          },
          required: true,
        });
        await publishTaskOperationalNotifications(tx, {
          organization_id,
          task_id,
          event_key: `completion-decision:${completionRequest.id}:${decision}`,
          type: TASK_OPERATIONAL_NOTIFICATION_TYPE.COMPLETION_DECISION,
          title:
            decision === TASK_COMPLETION_REQUEST_STATUS.APPROVED
              ? "Conclusão aprovada"
              : "Conclusão recusada",
          message:
            decision === TASK_COMPLETION_REQUEST_STATUS.APPROVED
              ? "A conclusão da tarefa foi aprovada."
              : "A conclusão da tarefa foi recusada.",
          responsible_ids: [
            completionRequest.requester_id,
            exists.responsible_id,
            exists.responsible2_id,
            exists.responsible3_id,
          ],
          exclude_user_id: user_id,
        });
        return task;
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
