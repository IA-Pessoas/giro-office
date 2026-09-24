import { debug, error as logError } from "@workspace/shared";

import type { ProjectProgressIntegration } from "../integrations/projectProgress.js";

/**
 * Efeitos colaterais de fluxo apos CRUD de tarefas de integracao (legado `TaskService` +
 * `ProjectService` / `EmailService`). Integracoes HTTP ficam aqui para manter o service de CRUD
 * focado em regra de negocio e persistencia.
 */
export class TaskWorkflowService {
  readonly #projectProgressIntegration: ProjectProgressIntegration;

  constructor(projectProgressIntegration: ProjectProgressIntegration) {
    this.#projectProgressIntegration = projectProgressIntegration;
  }

  /**
   * `ProjectService.calculateAndUpdateProjectPercentage` apos criar tarefa (legado ~481).
   */
  async afterTaskCreated(params: {
    projectId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    try {
      await this.#recalculateProjectPercentage(params);
    } catch (err: unknown) {
      logError("Workflow apos criar tarefa falhou", { err, projectId: params.projectId });
    }
  }

  /**
   * E-mail quando a tarefa passa a `Paralisado` com billing `Realizar` (legado ~564-567);
   * recalculo do projeto se `status` mudou (legado ~579-581).
   */
  async afterTaskUpdated(params: {
    taskId: string;
    projectId: string;
    userId: string;
    organizationId: string;
    previousStatus: string;
    newStatus: string;
    /** Billing antes do update (o legado usa `exists.billing` na condicao do e-mail). */
    previousBilling: string;
  }): Promise<void> {
    try {
      await this.#notifyTaskBecameStalledIfNeeded({
        taskId: params.taskId,
        previousStatus: params.previousStatus,
        previousBilling: params.previousBilling,
        newStatus: params.newStatus,
      });

      if (params.previousStatus !== params.newStatus) {
        await this.#recalculateProjectPercentage({
          projectId: params.projectId,
          userId: params.userId,
          organizationId: params.organizationId,
        });
      }
    } catch (err: unknown) {
      logError("Workflow apos atualizar tarefa falhou", { err, taskId: params.taskId });
    }
  }

  async #notifyTaskBecameStalledIfNeeded(ctx: {
    taskId: string;
    previousStatus: string;
    previousBilling: string;
    newStatus: string;
  }): Promise<void> {
    const becameParalisado =
      ctx.newStatus === "Paralisado" &&
      ctx.previousStatus !== "Paralisado" &&
      ctx.previousBilling === "Realizar";

    if (!becameParalisado) {
      return;
    }

    debug("Workflow: tarefa paralisada com billing Realizar - e-mail pendente de integracao", {
      taskId: ctx.taskId,
    });
    // TODO(project-service / notification): EmailService.sendTaskStalled (legado).
  }

  async #recalculateProjectPercentage(params: {
    projectId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    debug("Workflow: recalculando percentual do projeto via project-service", {
      projectId: params.projectId,
    });

    await this.#projectProgressIntegration.recalculateProjectProgress({
      projectId: params.projectId,
      userId: params.userId,
      organizationId: params.organizationId,
    });
  }
}
