import { ServiceError } from "@workspace/shared/http";
import {
  AI_TASK_EXTRACTION_MODES,
  type AiTaskExtractionMode,
  createAiTaskExtractionProvider,
} from "@workspace/task-service/src/integrations/aiTaskExtraction.js";
import { CommercialProspectingCloseService } from "@workspace/task-service/src/services/commercialProspectingCloseService.js";
import { CommercialTaskBillingProjectionService } from "@workspace/task-service/src/services/commercialTaskBillingProjectionService.js";
import { DepsTasksService } from "@workspace/task-service/src/services/depsTasksService.js";
import { ProjectPlanService } from "@workspace/task-service/src/services/projectPlanService.js";
import { ProjectWizardExtractionService } from "@workspace/task-service/src/services/projectWizardExtractionService.js";
import { ProjectWizardService } from "@workspace/task-service/src/services/projectWizardService.js";
import { TaskAttachmentService } from "@workspace/task-service/src/services/taskAttachmentService.js";
import { TaskCrudService } from "@workspace/task-service/src/services/taskCrudService.js";
import { TaskDependentService } from "@workspace/task-service/src/services/taskDependentService.js";
import { TaskFinanceiroService } from "@workspace/task-service/src/services/taskFinanceiroService.js";
import { TaskIntegrationRegularizeService } from "@workspace/task-service/src/services/taskIntegrationRegularizeService.js";
import { TaskLifecycleService } from "@workspace/task-service/src/services/taskLifecycleService.js";
import { TaskModelService } from "@workspace/task-service/src/services/taskModelService.js";
import { TaskOperationalNotificationService } from "@workspace/task-service/src/services/taskOperationalNotificationService.js";
import { TaskPostponementService } from "@workspace/task-service/src/services/taskPostponementService.js";
import { TaskReportingService } from "@workspace/task-service/src/services/taskReportingService.js";
import { createTaskAudit } from "./audit.js";
import type { TaskWorkerEnv } from "./env.js";
import { createProjectProgressIntegration } from "./projectProgress.js";
import { createTaskAttachmentStorage } from "./storage.js";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// O 503 diz ao front que a chamada não chegou ao provedor; o motivo fica só no log.
function extractionUnavailable(reason: string): never {
  console.error(`Extração de tarefas indisponível: ${reason}`);
  throw new ServiceError(503, "Extração por IA indisponível no momento.");
}

/** No Node, `AI_EXTRACTION_MODE=fake` é recusado em produção; aqui o fake só vem explícito. */
function extractionProvider(env: TaskWorkerEnv) {
  const mode = (env.AI_EXTRACTION_MODE ?? "openai") as AiTaskExtractionMode;
  if (!AI_TASK_EXTRACTION_MODES.includes(mode)) {
    extractionUnavailable("AI_EXTRACTION_MODE inválido.");
  }
  if (mode === "openai" && !env.OPENAI_API_KEY) {
    extractionUnavailable("configure o secret OPENAI_API_KEY.");
  }
  return createAiTaskExtractionProvider({
    mode,
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    timeoutMs: positiveInteger(env.AI_EXTRACTION_TIMEOUT_MS, 30_000),
  });
}

/**
 * Os serviços do task-service Node, com as dependências desta requisição. É a mesma
 * montagem do `nodeDeps.ts` do Node, trocando os singletons por Prisma, audit e
 * integrações do Worker.
 */
export function createTaskServices(prisma: unknown, env: TaskWorkerEnv) {
  const db = prisma as never;
  const audit = createTaskAudit(env);
  const projectProgress = createProjectProgressIntegration(env);
  const crud = () => new TaskCrudService(db, audit, projectProgress);
  return {
    crud,
    model: () => new TaskModelService(db, audit),
    dependent: () => new TaskDependentService(db, audit),
    integration: () => new TaskIntegrationRegularizeService(db, audit),
    lifecycle: () => new TaskLifecycleService(db, audit, projectProgress),
    postponement: () => new TaskPostponementService(db, audit),
    notification: () => new TaskOperationalNotificationService(db),
    attachment: () => new TaskAttachmentService(createTaskAttachmentStorage(env), db, audit),
    financeiro: () => new TaskFinanceiroService(db, audit),
    projectPlan: () => new ProjectPlanService(crud(), db, audit),
    wizard: () => new ProjectWizardService({ db, audit, taskService: crud() }),
    extraction: () => new ProjectWizardExtractionService(extractionProvider(env), db),
    deps: () => new DepsTasksService(db),
    reporting: () => new TaskReportingService(db),
    commercialTaskBilling: () => new CommercialTaskBillingProjectionService(db),
    commercialProspectingClose: () => new CommercialProspectingCloseService(db),
  };
}

export type TaskServices = ReturnType<typeof createTaskServices>;
