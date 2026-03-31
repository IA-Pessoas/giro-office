import { debug, error as logError } from "@workspace/shared";

/**
 * Efeitos colaterais de fluxo após CRUD de tarefas de integração (legado `TaskService` +
 * `ProjectService` / `EmailService`). Integrações HTTP ficam para quando existir `project-service`
 * e canal de e-mail exposto ao task-service.
 */
export class TaskWorkflowService {
  /**
   * `ProjectService.calculateAndUpdateProjectPercentage` após criar tarefa (legado ~481).
   */
  async afterTaskCreated(projectId: string): Promise<void> {
    try {
      await this.#recalculateProjectPercentage(projectId);
    } catch (err: unknown) {
      logError("Workflow após criar tarefa falhou", { err, projectId });
    }
  }

  /**
   * E-mail quando a tarefa passa a `Paralisado` com billing `Realizar` (legado ~564–567);
   * recálculo do projeto se `status` mudou (legado ~579–581).
   */
  async afterTaskUpdated(params: {
    taskId: string;
    projectId: string;
    previousStatus: string;
    newStatus: string;
    /** Billing antes do update (o legado usa `exists.billing` na condição do e-mail). */
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
        await this.#recalculateProjectPercentage(params.projectId);
      }
    } catch (err: unknown) {
      logError("Workflow após atualizar tarefa falhou", { err, taskId: params.taskId });
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

    debug("Workflow: tarefa paralisada com billing Realizar — e-mail pendente de integração", {
      taskId: ctx.taskId,
    });
    // TODO(project-service / notification): EmailService.sendTaskStalled (legado).
  }

  async #recalculateProjectPercentage(projectId: string): Promise<void> {
    debug("Workflow: recalcular percentual do projeto — project-service ainda não integrado", {
      projectId,
    });
    // TODO(project-service): ProjectService.calculateAndUpdateProjectPercentage.
  }
}
