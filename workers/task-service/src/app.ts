import { extname } from "node:path";
import { createSupabaseStorageClient, type WorkerAuthContext } from "@workspace/runtime";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  normalizeModulePermission,
  parseWithZod,
  REQUEST_ID_HEADER,
  reportingQueryFields,
  requireAuthenticatedRequestContext,
  requireIntegracaoRouteAccess,
  ServiceError,
  serializeError,
  zNonEmptyText,
} from "@workspace/shared";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import {
  AI_TASK_EXTRACTION_MODES,
  type AiTaskExtractionMode,
  createAiTaskExtractionProvider,
} from "@workspace/task-service/src/integrations/aiTaskExtraction.js";
import { commercialProspectingCloseEventSchema } from "@workspace/task-service/src/schemas/commercialProspectingClose.schemas.js";
import { commercialTaskBillingEventSchema } from "@workspace/task-service/src/schemas/commercialTaskBilling.schemas.js";
import {
  financeiroCollectorsBodySchema,
  financeiroCollectorsQuerySchema,
  financeiroExpressBodySchema,
  financeiroQueueQuerySchema,
  financeiroSettlementBodySchema,
  financeiroTaskUpdateBodySchema,
} from "@workspace/task-service/src/schemas/financeiroTaskUpdateBody.schema.js";
import { integracaoTaskCompleteRequestBodySchema } from "@workspace/task-service/src/schemas/integracaoTaskCompleteRequestBody.schema.js";
import {
  integracaoTaskCompletionRequestBodySchema,
  integracaoTaskCompletionRequestListQuerySchema,
  integracaoTaskReopenBodySchema,
} from "@workspace/task-service/src/schemas/integracaoTaskCompletionRequest.schema.js";
import { integracaoTaskConclusionBodySchema } from "@workspace/task-service/src/schemas/integracaoTaskConclusionBody.schema.js";
import { integracaoTaskCreateBodySchema } from "@workspace/task-service/src/schemas/integracaoTaskCreate.schema.js";
import {
  integracaoTaskPostponementBodySchema,
  integracaoTaskPostponementListQuerySchema,
} from "@workspace/task-service/src/schemas/integracaoTaskPostponement.schema.js";
import { integracaoTaskUpdateBodySchema } from "@workspace/task-service/src/schemas/integracaoTaskUpdate.schema.js";
import { internalReportingExtractBodySchema } from "@workspace/task-service/src/schemas/internalReporting.schemas.js";
import {
  projectPlanAddTaskBodySchema,
  projectPlanCreateBodySchema,
  projectPlanDeleteParamsSchema,
  projectPlanDeleteTaskBodySchema,
  projectPlanDetailQuerySchema,
  projectPlanHireBodySchema,
  projectPlanListTasksQuerySchema,
  projectPlanReorderTaskBodySchema,
  projectPlanUpdateBodySchema,
} from "@workspace/task-service/src/schemas/projectPlan.schemas.js";
import {
  idempotencyKeySchema,
  projectWizardCreateBodySchema,
  projectWizardPreviewBodySchema,
} from "@workspace/task-service/src/schemas/projectWizard.schemas.js";
import {
  MEETING_MINUTES_MAX_SOURCE_BYTES,
  projectWizardExtractTasksBodySchema,
} from "@workspace/task-service/src/schemas/projectWizardExtraction.schemas.js";
import {
  taskAttachmentBodySchema,
  taskAttachmentDeleteBodySchema,
  taskAttachmentListQuerySchema,
  taskAttachmentQuerySchema,
} from "@workspace/task-service/src/schemas/taskAttachment.schemas.js";
import {
  taskIntegrationRegularizeBodySchema,
  taskIntegrationRegularizeDeleteBodySchema,
  taskIntegrationRegularizeListQuerySchema,
} from "@workspace/task-service/src/schemas/taskIntegrationRegularize.schemas.js";
import { taskListQuerySchema } from "@workspace/task-service/src/schemas/taskList.schemas.js";
import {
  taskModelListQuerySchema,
  taskModelOptionsQuerySchema,
} from "@workspace/task-service/src/schemas/taskModelList.schemas.js";
import { parseTaskModelResponsibleSequence } from "@workspace/task-service/src/schemas/taskModelResponsibleSequence.schemas.js";
import { taskOperationalNotificationReadBodySchema } from "@workspace/task-service/src/schemas/taskOperationalNotification.schemas.js";
import { DOCX_MIME_TYPE, extractDocxText } from "@workspace/task-service/src/utils/docx.js";
import { extractPdfText, PDF_MIME_TYPE } from "@workspace/task-service/src/utils/pdf.js";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateTaskRequest } from "./auth.js";
import { runInTaskContext } from "./context.js";
import type { TaskWorkerEnv } from "./env.js";
import {
  publishedReportingCatalog,
  REPORTS_GRANT_HEADER,
  REPORTS_GRANT_SIGNATURE_HEADER,
  verifyReportingGrant,
} from "./internalReporting.js";
import prismaClient from "./prisma/index.js";
import { CommercialProspectingCloseService } from "./services/commercialProspectingCloseService.js";
import { CommercialTaskBillingProjectionService } from "./services/commercialTaskBillingProjectionService.js";
import { DepsTasksService } from "./services/depsTasksService.js";
import { ProjectPlanService } from "./services/projectPlanService.js";
import { ProjectWizardExtractionService } from "./services/projectWizardExtractionService.js";
import { ProjectWizardService } from "./services/projectWizardService.js";
import { TaskAttachmentService } from "./services/taskAttachmentService.js";
import {
  SupabaseTaskAttachmentStorage,
  TASK_ATTACHMENT_MIME_TYPES,
  type TaskAttachmentMimeType,
} from "./services/taskAttachmentStorage.js";
import { TaskCrudService } from "./services/taskCrudService.js";
import { TaskDependentService } from "./services/taskDependentService.js";
import { TaskFinanceiroService } from "./services/taskFinanceiroService.js";
import { TaskIntegrationRegularizeService } from "./services/taskIntegrationRegularizeService.js";
import { TaskLifecycleService } from "./services/taskLifecycleService.js";
import { TaskModelService } from "./services/taskModelService.js";
import { TaskOperationalNotificationService } from "./services/taskOperationalNotificationService.js";
import { TaskPostponementService } from "./services/taskPostponementService.js";
import { TaskReportingService } from "./services/taskReportingService.js";

export type { TaskWorkerEnv } from "./env.js";

type Methods<T, K extends keyof T> = Pick<T, K>;

export type TaskServices = {
  taskModel: Methods<
    TaskModelService,
    "createModel" | "detailModel" | "updateModel" | "listModel" | "deleteModel"
  >;
  taskDependent: Methods<
    TaskDependentService,
    "addDependent" | "listDependents" | "deleteDependent"
  >;
  taskIntegrationRegularize: Methods<
    TaskIntegrationRegularizeService,
    "createLink" | "removeLink" | "list"
  >;
  taskLifecycle: Methods<
    TaskLifecycleService,
    | "concludeTask"
    | "requestTaskCompletion"
    | "approveTaskCompletion"
    | "cancelTaskCompletion"
    | "listTaskCompletionRequests"
    | "reopenTask"
  >;
  taskPostponement: Methods<TaskPostponementService, "create" | "list">;
  taskOperationalNotification: Methods<TaskOperationalNotificationService, "list" | "markRead">;
  taskAttachment: Methods<TaskAttachmentService, "upload" | "list" | "createAccessUrl" | "remove">;
  taskFinanceiro: Methods<
    TaskFinanceiroService,
    "settle" | "listQueue" | "setCollectors" | "listCollectors" | "settleExpress"
  >;
  taskCrud: Methods<
    TaskCrudService,
    "createTask" | "listTasks" | "updateTask" | "detailTask" | "deleteTask"
  >;
  projectWizard: Methods<ProjectWizardService, "create" | "preview">;
  projectWizardExtraction: Methods<ProjectWizardExtractionService, "extractTasks">;
  projectPlan: Methods<
    ProjectPlanService,
    | "create"
    | "list"
    | "update"
    | "detail"
    | "delete"
    | "addTask"
    | "listTasks"
    | "reorderTask"
    | "deleteTask"
    | "hirePlan"
  >;
  depsTasks: Methods<DepsTasksService, "listDepartmentsWithTaskModels" | "listTaskModelOptions">;
  reporting: Methods<TaskReportingService, "extract">;
  commercialTaskBilling: Methods<CommercialTaskBillingProjectionService, "apply">;
  commercialProspectingClose: Methods<CommercialProspectingCloseService, "apply">;
};

type TaskWorkerContext = {
  Bindings: TaskWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type TaskContext = Context<TaskWorkerContext>;
type TaskWorkerOptions = { env?: TaskWorkerEnv; services?: Partial<TaskServices> };

const JSON_BODY_MAX_BYTES = 1024 * 1024;
const PROJECT_WIZARD_EXTRACTION_JSON_BODY_MAX_BYTES =
  MEETING_MINUTES_MAX_SOURCE_BYTES * 6 + 1024 * 1024;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MEETING_MINUTES_MAX_FIELDS = 4;
const ATTACHMENTS_UNAVAILABLE = "Anexos indisponíveis no momento. Tente novamente mais tarde.";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractionMode(env: TaskWorkerEnv): AiTaskExtractionMode {
  // Sem modo explícito vale "openai", como em produção no Node, onde "fake" é recusado.
  const mode = env.AI_EXTRACTION_MODE ?? "openai";
  if (!AI_TASK_EXTRACTION_MODES.includes(mode as AiTaskExtractionMode)) {
    throw new ServiceError(503, "Extração de tarefas por IA não configurada.");
  }
  if (mode === "openai" && !env.OPENAI_API_KEY) {
    throw new ServiceError(503, "Extração de tarefas por IA não configurada.");
  }
  return mode as AiTaskExtractionMode;
}

const serviceFactories: { [K in keyof TaskServices]: (env: TaskWorkerEnv) => TaskServices[K] } = {
  taskModel: () => new TaskModelService(),
  taskDependent: () => new TaskDependentService(),
  taskIntegrationRegularize: () => new TaskIntegrationRegularizeService(),
  taskLifecycle: () => new TaskLifecycleService(),
  taskPostponement: () => new TaskPostponementService(),
  taskOperationalNotification: () => new TaskOperationalNotificationService(),
  taskAttachment: (env) => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new ServiceError(503, ATTACHMENTS_UNAVAILABLE);
    }
    return new TaskAttachmentService(
      new SupabaseTaskAttachmentStorage(
        createSupabaseStorageClient({
          SUPABASE_URL: env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        }),
        env.TASK_ATTACHMENT_STORAGE_BUCKET ?? "task-attachments-private",
      ),
    );
  },
  taskFinanceiro: () => new TaskFinanceiroService(),
  taskCrud: () => new TaskCrudService(),
  projectWizard: () => new ProjectWizardService(),
  projectWizardExtraction: (env) =>
    new ProjectWizardExtractionService(
      createAiTaskExtractionProvider({
        mode: extractionMode(env),
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
        timeoutMs: positiveInteger(env.AI_EXTRACTION_TIMEOUT_MS, 30_000),
      }),
    ),
  projectPlan: () => new ProjectPlanService(),
  depsTasks: () => new DepsTasksService(),
  reporting: () => new TaskReportingService(prismaClient),
  commercialTaskBilling: () => new CommercialTaskBillingProjectionService(),
  commercialProspectingClose: () => new CommercialProspectingCloseService(prismaClient),
};

/**
 * Janela fixa em memória, como o `createRateLimitMiddleware` do Node, por usuário.
 * ponytail: o contador vive no isolate (o Node era por processo); limite global entre
 * isolates pede o binding de Rate Limiting ou um Durable Object.
 */
function createRateLimit(max: number, windowMs: number, message: string) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (c: TaskContext) => {
    const now = Date.now();
    const auth = c.get("auth");
    const key = `${auth.organizationId}:${auth.userId}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= 10_000) hits.delete(hits.keys().next().value as string);
      entry = { count: 0, resetAt: now + windowMs };
    }
    if (entry.count >= max) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      throw new ServiceError(429, message);
    }
    entry.count += 1;
    hits.set(key, entry);
  };
}

async function jsonBody(c: TaskContext, maxBytes = JSON_BODY_MAX_BYTES): Promise<unknown> {
  const contentType = c.req.header("content-type") ?? "";
  if (!/application\/(?:[\w.+-]+\+)?json/iu.test(contentType) || !c.req.raw.body) return {};
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ServiceError(413, "Corpo da requisição excede o limite permitido.");
  }
  if (!text.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // cai no 400 abaixo
  }
  throw new ServiceError(400, "JSON inválido.");
}

/** `req.body` do Express: campos lidos sem validação por rotas que não usam Zod. */
async function looseBody(c: TaskContext): Promise<Record<string, unknown>> {
  return (await jsonBody(c)) as Record<string, unknown>;
}

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function actor(c: TaskContext) {
  const auth = c.get("auth");
  const { user_id, organization_id, permission } = requireAuthenticatedRequestContext({
    user_id: auth.userId,
    organization_id: auth.organizationId,
    permission: auth.claims.permission,
  });
  return {
    user_id,
    organization_id,
    permission,
    modules: auth.claims.modules as Record<string, number>,
    userType: auth.claims.type,
    integracaoLevel: normalizeModulePermission(auth.claims.modules.integracao),
    financeiroLevel: normalizeModulePermission(auth.claims.modules.financeiro),
    isOwner: auth.claims.type === "owner",
  };
}

function idempotencyKey(c: TaskContext): string {
  const value = c.req.header("Idempotency-Key");
  return value
    ? parseWithZod(zNonEmptyText("Idempotency-Key").max(255), value)
    : crypto.randomUUID();
}

type MultipartFields = Record<string, string | File | (string | File)[]>;

async function multipartBody(c: TaskContext): Promise<MultipartFields> {
  try {
    return (await c.req.parseBody({ all: true })) as MultipartFields;
  } catch {
    throw new ServiceError(400, "Upload inválido.");
  }
}

function isMultipart(c: TaskContext): boolean {
  return (c.req.header("content-type") ?? "").toLowerCase().startsWith("multipart/form-data");
}

/** multer.single("file") do Node: um arquivo, limite de tamanho, e os demais campos. */
function splitUpload(
  body: MultipartFields,
  maxFields = Number.POSITIVE_INFINITY,
): { file: File | undefined; fields: Record<string, unknown> } {
  let file: File | undefined;
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(body)) {
    const values = Array.isArray(value) ? value : [value];
    if (values.some((item) => item instanceof File)) {
      if (name !== "file" || values.length > 1) throw new ServiceError(400, "Upload inválido.");
      file = values[0] as File;
    } else {
      fields[name] = value;
    }
  }
  if (Object.keys(fields).length > maxFields) throw new ServiceError(400, "Upload inválido.");
  return { file, fields };
}

async function attachmentUpload(c: TaskContext) {
  const { file, fields } = isMultipart(c)
    ? splitUpload(await multipartBody(c))
    : { file: undefined, fields: {} };
  if (!file) throw new ServiceError(400, "Arquivo é obrigatório.");
  if (!TASK_ATTACHMENT_MIME_TYPES.includes(file.type as TaskAttachmentMimeType)) {
    throw new ServiceError(400, "Tipo de arquivo não permitido.");
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new ServiceError(400, "Arquivo excede o limite de 10 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  validateUploadFileSignature({ buffer, mimetype: file.type, originalname: file.name });
  return {
    fields,
    file: { buffer, mimetype: file.type as TaskAttachmentMimeType, originalname: file.name },
  };
}

interface MeetingMinutesFormat {
  mimeTypes: readonly string[];
  extract?: (file: Buffer) => string;
}

/** Formatos aceitos por extensão; os binários trazem o extrator próprio de texto. */
const MEETING_MINUTES_FORMATS: Record<string, MeetingMinutesFormat> = {
  ".txt": { mimeTypes: ["text/plain"] },
  ".md": { mimeTypes: ["text/markdown", "text/plain", "text/x-markdown"] },
  ".docx": { mimeTypes: [DOCX_MIME_TYPE], extract: extractDocxText },
  ".pdf": { mimeTypes: [PDF_MIME_TYPE], extract: extractPdfText },
};

function decodeUtf8(file: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file);
  } catch {
    throw new ServiceError(400, "O arquivo da Ata deve conter texto UTF-8 válido.");
  }
}

/** Corpo da extração: a Ata pode vir como JSON (`content`) ou como arquivo multipart. */
async function extractionBody(c: TaskContext): Promise<unknown> {
  if (!isMultipart(c)) return jsonBody(c, PROJECT_WIZARD_EXTRACTION_JSON_BODY_MAX_BYTES);

  const { file, fields } = splitUpload(await multipartBody(c), MEETING_MINUTES_MAX_FIELDS);
  const format = file ? MEETING_MINUTES_FORMATS[extname(file.name).toLowerCase()] : undefined;
  if (file && !format?.mimeTypes.includes(file.type)) {
    throw new ServiceError(400, "Tipo de arquivo não permitido.");
  }
  if (file && file.size > MEETING_MINUTES_MAX_SOURCE_BYTES) {
    throw new ServiceError(400, "Arquivo excede o limite de 10 MB.");
  }
  if (!file || file.size === 0 || !format) {
    throw new ServiceError(400, "O arquivo da Ata é obrigatório e não pode estar vazio.");
  }

  try {
    const content = (format.extract ?? decodeUtf8)(Buffer.from(await file.arrayBuffer()));
    if (content.includes("\0"))
      throw new ServiceError(400, "O arquivo da Ata não pode conter NUL.");
    if (!content.trim()) throw new ServiceError(400, "O arquivo da Ata não contém texto.");
    return { ...fields, content };
  } catch (decodeError) {
    console.error("Falha ao decodificar arquivo da Ata", {
      name: decodeError instanceof Error ? decodeError.name : typeof decodeError,
    });
    throw decodeError instanceof ServiceError
      ? decodeError
      : new ServiceError(400, "O arquivo da Ata não pôde ser lido.");
  }
}

function requireCommercialServiceToken(c: TaskContext, env: TaskWorkerEnv): void {
  if (!env.COMMERCIAL_SERVICE_TOKEN) {
    throw new ServiceError(503, "Integração comercial não configurada.");
  }
  if (c.req.header(INTERNAL_SERVICE_TOKEN_HEADER) !== env.COMMERCIAL_SERVICE_TOKEN) {
    throw new ServiceError(403, "Acesso negado.");
  }
}

export function createTaskWorkerApp(options: TaskWorkerOptions = {}) {
  const app = new Hono<TaskWorkerContext>({ strict: false });
  const envOf = (c: TaskContext) => options.env ?? c.env;
  const service = <K extends keyof TaskServices>(c: TaskContext, key: K): TaskServices[K] =>
    options.services?.[key] ?? serviceFactories[key](envOf(c));

  const withContext = (c: TaskContext, next: Next) => runInTaskContext(envOf(c), next);
  const authenticate = async (c: TaskContext, next: Next) => {
    c.set("auth", await authenticateTaskRequest(c.req.raw, envOf(c)));
    await next();
  };
  // O env só chega com a primeira requisição; o limite da extração é fixado nela.
  let extractionLimiter: ReturnType<typeof createRateLimit> | undefined;
  const extractionRateLimit = (c: TaskContext) => {
    const env = envOf(c);
    extractionLimiter ??= createRateLimit(
      positiveInteger(env.AI_EXTRACTION_RATE_LIMIT_MAX, 10),
      positiveInteger(env.AI_EXTRACTION_RATE_LIMIT_WINDOW_MS, 60_000),
      "Muitas extrações seguidas. Aguarde antes de tentar novamente.",
    );
    extractionLimiter(c);
  };
  const attachmentUploadRateLimit = createRateLimit(
    10,
    60_000,
    "Muitos anexos seguidos. Aguarde antes de tentar novamente.",
  );

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "task-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "task-service" })),
  );

  app.use("/task", withContext, authenticate);
  app.use("/task/*", withContext, authenticate);
  app.use("/internal/*", withContext);

  // taskModel.routes.ts
  app.post("/task/model", async (c) => {
    const body = await looseBody(c);
    const {
      name,
      department_id,
      responsible_id,
      responsible2_id,
      responsible3_id,
      observations,
      billing,
      prevision,
      type,
    } = body as Record<string, never>;
    const who = actor(c);
    const responsibleSequence = parseTaskModelResponsibleSequence({
      responsible_id,
      responsible2_id: responsible2_id ?? null,
      responsible3_id: responsible3_id ?? null,
    });
    if (!name || !department_id || !responsible_id || !billing || prevision === undefined) {
      throw new ServiceError(
        400,
        "Campos obrigatórios: name, department_id, responsible_id, billing, prevision.",
      );
    }
    const result = await service(c, "taskModel").createModel({
      user_id: who.user_id,
      organization_id: who.organization_id,
      name,
      department_id,
      responsible_id: responsibleSequence.responsible_id,
      responsible2_id: responsibleSequence.responsible2_id,
      responsible3_id: responsibleSequence.responsible3_id,
      observations: observations ?? null,
      billing,
      prevision: Number(prevision),
      type: type ?? null,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/model", async (c) => {
    const body = await looseBody(c);
    const task_id = (body.task_id ?? c.req.query("task_id")) as string;
    const who = actor(c);
    if (!task_id) throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    const result = await service(c, "taskModel").detailModel(task_id, who.organization_id, {
      userId: who.user_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/model", async (c) => {
    const body = await looseBody(c);
    const {
      task_id,
      name,
      department_id,
      responsible_id,
      responsible2_id,
      responsible3_id,
      observations,
      billing,
      prevision,
      type,
    } = body as Record<string, never>;
    const who = actor(c);
    const responsibleSequence = parseTaskModelResponsibleSequence({
      responsible_id,
      responsible2_id: responsible2_id ?? null,
      responsible3_id: responsible3_id ?? null,
    });
    if (
      !task_id ||
      !name ||
      !department_id ||
      !responsible_id ||
      !billing ||
      prevision === undefined
    ) {
      throw new ServiceError(
        400,
        "Campos obrigatórios: task_id, name, department_id, responsible_id, billing, prevision.",
      );
    }
    const result = await service(c, "taskModel").updateModel({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id,
      name,
      department_id,
      responsible_id: responsibleSequence.responsible_id,
      responsible2_id: responsibleSequence.responsible2_id,
      responsible3_id: responsibleSequence.responsible3_id,
      observations: observations ?? null,
      billing,
      prevision: Number(prevision),
      type: type ?? null,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/model/list", async (c) => {
    const who = actor(c);
    const rawQuery = c.req.query();
    const body = await looseBody(c);
    const paginationRequested = rawQuery.page !== undefined || rawQuery.limit !== undefined;
    const query = parseWithZod(taskModelListQuerySchema, {
      ...rawQuery,
      type: rawQuery.type ?? body.type,
      billing: rawQuery.billing ?? body.billing,
    });
    const result = await service(c, "taskModel").listModel({
      organizationId: who.organization_id,
      userId: who.user_id,
      paginationRequested,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
      ...query,
    });
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/model", async (c) => {
    const body = await looseBody(c);
    const task_id = (body.task_id ?? c.req.query("task_id")) as string;
    const who = actor(c);
    if (!task_id) throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    const result = await service(c, "taskModel").deleteModel({
      task_id,
      user_id: who.user_id,
      organization_id: who.organization_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskDependent.routes.ts
  app.post("/task/model/dependent", async (c) => {
    const { task_model_id, dependent_id, wait, observation } = (await looseBody(c)) as Record<
      string,
      never
    >;
    const who = actor(c);
    if (!task_model_id || !dependent_id || wait === undefined || observation === undefined) {
      throw new ServiceError(
        400,
        "Campos obrigatórios: task_model_id, dependent_id, wait, observation.",
      );
    }
    const result = await service(c, "taskDependent").addDependent({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_model_id,
      dependent_id,
      wait: Boolean(wait),
      observation: String(observation),
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/model/dependent", async (c) => {
    const body = await looseBody(c);
    const task_model_id = (body.task_model_id ?? c.req.query("task_model_id")) as string;
    const who = actor(c);
    if (!task_model_id) {
      throw new ServiceError(400, "task_model_id é obrigatório (body ou query).");
    }
    const result = await service(c, "taskDependent").listDependents(
      task_model_id,
      who.organization_id,
      { userId: who.user_id, integracaoLevel: who.integracaoLevel, isOwner: who.isOwner },
    );
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/model/dependent", async (c) => {
    const body = await looseBody(c);
    const id = (body.id ?? c.req.query("id")) as string;
    const who = actor(c);
    if (!id) throw new ServiceError(400, "id é obrigatório (body ou query).");
    const result = await service(c, "taskDependent").deleteDependent({
      id,
      user_id: who.user_id,
      organization_id: who.organization_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskIntegrationRegularize.routes.ts
  app.post("/task/integration", async (c) => {
    const { task_model_id, referring, referring_type } = parseWithZod(
      taskIntegrationRegularizeBodySchema,
      await jsonBody(c),
    );
    const who = actor(c);
    const result = await service(c, "taskIntegrationRegularize").createLink({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_model_id,
      referring,
      referring_type,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.delete("/task/integration", async (c) => {
    const { integration_id } = parseWithZod(
      taskIntegrationRegularizeDeleteBodySchema,
      await jsonBody(c),
    );
    const who = actor(c);
    const result = await service(c, "taskIntegrationRegularize").removeLink({
      user_id: who.user_id,
      organization_id: who.organization_id,
      integration_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/integration", async (c) => {
    const { task_model_id } = parseWithZod(taskIntegrationRegularizeListQuerySchema, c.req.query());
    const who = actor(c);
    const result = await service(c, "taskIntegrationRegularize").list(
      who.organization_id,
      task_model_id,
      { userId: who.user_id, integracaoLevel: who.integracaoLevel, isOwner: who.isOwner },
    );
    return c.json(createSuccessResponse(result));
  });

  // taskLifecycle.routes.ts
  app.put("/task/conclusion", async (c) => {
    const who = actor(c);
    const body = parseWithZod(integracaoTaskConclusionBodySchema, await jsonBody(c));
    const result = await service(c, "taskLifecycle").concludeTask({
      user_id: who.user_id,
      organization_id: who.organization_id,
      body: {
        ...body,
        observations: body.observations ?? "",
        justification: body.justification ?? "",
      },
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/complete-request", async (c) => {
    const who = actor(c);
    const body = parseWithZod(integracaoTaskCompletionRequestBodySchema, await jsonBody(c));
    const result = await service(c, "taskLifecycle").requestTaskCompletion({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: body.task_id,
      reason: body.reason,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/complete-request", async (c) => {
    const who = actor(c);
    const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, await jsonBody(c));
    const result = await service(c, "taskLifecycle").approveTaskCompletion({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: parsed.task_id,
      ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
      ...(parsed.decision ? { decision: parsed.decision } : {}),
      ...(parsed.reason ? { reason: parsed.reason } : {}),
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/complete-request", async (c) => {
    const who = actor(c);
    const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, await jsonBody(c));
    const result = await service(c, "taskLifecycle").cancelTaskCompletion({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: parsed.task_id,
      ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/complete-request/list", async (c) => {
    const who = actor(c);
    const query = parseWithZod(integracaoTaskCompletionRequestListQuerySchema, c.req.query());
    const result = await service(c, "taskLifecycle").listTaskCompletionRequests({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: query.task_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/reopen", async (c) => {
    const who = actor(c);
    const body = parseWithZod(integracaoTaskReopenBodySchema, await jsonBody(c));
    const result = await service(c, "taskLifecycle").reopenTask({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: body.task_id,
      reason: body.reason,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskPostponement.routes.ts
  app.post("/task/postponement", async (c) => {
    const who = actor(c);
    const body = parseWithZod(integracaoTaskPostponementBodySchema, await jsonBody(c));
    const result = await service(c, "taskPostponement").create({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: body.task_id,
      new_prevision_date: body.new_prevision_date,
      justification: body.justification,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/postponement/list", async (c) => {
    const who = actor(c);
    const query = parseWithZod(integracaoTaskPostponementListQuerySchema, c.req.query());
    const result = await service(c, "taskPostponement").list({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: query.task_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskOperationalNotification.routes.ts
  app.get("/task/notifications", async (c) => {
    const who = actor(c);
    requireIntegracaoRouteAccess("GET", "/task/notifications", {
      userId: who.user_id,
      organizationId: who.organization_id,
      level: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    const result = await service(c, "taskOperationalNotification").list({
      user_id: who.user_id,
      organization_id: who.organization_id,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/notifications/read", async (c) => {
    const who = actor(c);
    const body = parseWithZod(taskOperationalNotificationReadBodySchema, await jsonBody(c));
    requireIntegracaoRouteAccess("PUT", "/task/notifications/read", {
      userId: who.user_id,
      organizationId: who.organization_id,
      level: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    const result = await service(c, "taskOperationalNotification").markRead({
      user_id: who.user_id,
      organization_id: who.organization_id,
      notification_id: body.notification_id,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskAttachment.routes.ts
  app.post("/task/attachment", async (c) => {
    attachmentUploadRateLimit(c);
    const upload = await attachmentUpload(c);
    const who = actor(c);
    const body = parseWithZod(taskAttachmentBodySchema, upload.fields);
    const result = await service(c, "taskAttachment").upload({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: body.task_id,
      file: upload.file,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/attachment/list", async (c) => {
    const who = actor(c);
    const query = parseWithZod(taskAttachmentListQuerySchema, c.req.query());
    const result = await service(c, "taskAttachment").list({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: query.task_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/attachment/access", async (c) => {
    const who = actor(c);
    const query = parseWithZod(taskAttachmentQuerySchema, c.req.query());
    const result = await service(c, "taskAttachment").createAccessUrl({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: query.task_id,
      attachment_id: query.attachment_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/attachment", async (c) => {
    const who = actor(c);
    const body = parseWithZod(taskAttachmentDeleteBodySchema, await jsonBody(c));
    const result = await service(c, "taskAttachment").remove({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id: body.task_id,
      attachment_id: body.attachment_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // taskFinanceiro.routes.ts
  const financeiroContext = (c: TaskContext) => {
    const who = actor(c);
    return {
      user_id: who.user_id,
      organization_id: who.organization_id,
      integracao_level: who.integracaoLevel,
      financeiro_level: who.financeiroLevel,
      is_owner: who.isOwner,
    };
  };

  app.put("/task/financeiro", async (c) => {
    const body = parseWithZod(financeiroTaskUpdateBodySchema, await jsonBody(c));
    const result = await service(c, "taskFinanceiro").settle({
      ...financeiroContext(c),
      task_ids: [body.task_id],
      idempotency_key: idempotencyKey(c),
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/financeiro/queue", async (c) => {
    const query = parseWithZod(financeiroQueueQuerySchema, c.req.query());
    const result = await service(c, "taskFinanceiro").listQueue({
      ...financeiroContext(c),
      ...query,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/financeiro/collectors", async (c) => {
    const body = parseWithZod(financeiroCollectorsBodySchema, await jsonBody(c));
    const result = await service(c, "taskFinanceiro").setCollectors({
      ...financeiroContext(c),
      ...body,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/financeiro/collectors", async (c) => {
    const query = parseWithZod(financeiroCollectorsQuerySchema, c.req.query());
    const result = await service(c, "taskFinanceiro").listCollectors({
      ...financeiroContext(c),
      ...query,
    });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/financeiro/settle", async (c) => {
    const body = parseWithZod(financeiroSettlementBodySchema, await jsonBody(c));
    const result = await service(c, "taskFinanceiro").settle({
      ...financeiroContext(c),
      ...body,
      idempotency_key: idempotencyKey(c),
    });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/financeiro/express", async (c) => {
    const body = parseWithZod(financeiroExpressBodySchema, await jsonBody(c));
    const result = await service(c, "taskFinanceiro").settleExpress({
      ...financeiroContext(c),
      ...body,
      idempotency_key: idempotencyKey(c),
    });
    return c.json(createSuccessResponse(result));
  });

  // taskCrud.routes.ts
  app.post("/task", async (c) => {
    const who = actor(c);
    const body = parseWithZod(integracaoTaskCreateBodySchema, await jsonBody(c));
    const result = await service(c, "taskCrud").createTask({
      user_id: who.user_id,
      organization_id: who.organization_id,
      model_id: body.model_id,
      project_id: body.project_id,
      client_id: body.client_id,
      prospecting_status: body.prospecting_status,
      name: body.name,
      status: body.status,
      department_id: body.department_id,
      observations: body.observations,
      billing: body.billing,
      urgency: body.urgency,
      responsible_id: body.responsible_id,
      prevision_date: body.prevision_date,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/list", async (c) => {
    const who = actor(c);
    const query = parseWithZod(taskListQuerySchema, c.req.query());
    const result = await service(c, "taskCrud").listTasks({
      organization_id: who.organization_id,
      user_id: who.user_id,
      ...query,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.put("/task", async (c) => {
    const who = actor(c);
    const { task_id, ...patch } = parseWithZod(integracaoTaskUpdateBodySchema, await jsonBody(c));
    const result = await service(c, "taskCrud").updateTask({
      user_id: who.user_id,
      organization_id: who.organization_id,
      task_id,
      ...patch,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task", async (c) => {
    const body = await looseBody(c);
    const task_id = (body.task_id ?? c.req.query("task_id")) as string;
    const who = actor(c);
    if (!task_id) throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    const result = await service(c, "taskCrud").detailTask(task_id, who.organization_id, {
      user_id: who.user_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task", async (c) => {
    const body = await looseBody(c);
    const task_id = (body.task_id ?? c.req.query("task_id")) as string;
    const who = actor(c);
    if (!task_id) throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    const result = await service(c, "taskCrud").deleteTask({
      task_id,
      user_id: who.user_id,
      organization_id: who.organization_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    });
    return c.json(createSuccessResponse(result));
  });

  // projectWizard.routes.ts
  app.post("/task/project-wizard/preview", async (c) => {
    const body = parseWithZod(projectWizardPreviewBodySchema, await jsonBody(c));
    const who = actor(c);
    const result = await service(c, "projectWizard").preview({
      userId: who.user_id,
      organizationId: who.organization_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
      tasks: body.tasks,
    });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/project-wizard", async (c) => {
    const body = parseWithZod(projectWizardCreateBodySchema, await jsonBody(c));
    const key = parseWithZod(idempotencyKeySchema, c.req.header("Idempotency-Key"));
    const who = actor(c);
    const result = await service(c, "projectWizard").create({
      userId: who.user_id,
      organizationId: who.organization_id,
      permission: who.permission,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
      userType: who.userType,
      modules: who.modules,
      idempotencyKey: key,
      ...body,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.post("/task/project-wizard/extract-tasks", async (c) => {
    const body = parseWithZod(projectWizardExtractTasksBodySchema, await extractionBody(c));
    extractionRateLimit(c);
    const who = actor(c);
    try {
      const result = await service(c, "projectWizardExtraction").extractTasks({
        userId: who.user_id,
        organizationId: who.organization_id,
        integracaoLevel: who.integracaoLevel,
        isOwner: who.isOwner,
        ...body,
      });
      return c.json(createSuccessResponse(result));
    } catch (err) {
      // A Ata e a resposta bruta da IA nunca vão para o log: apenas a mensagem do evento.
      console.error("Erro ao extrair tarefas da Ata pelo wizard");
      throw err;
    }
  });

  // projectPlan.routes.ts
  const planAuth = (c: TaskContext) => {
    const who = actor(c);
    return {
      user_id: who.user_id,
      organization_id: who.organization_id,
      integracaoLevel: who.integracaoLevel,
      isOwner: who.isOwner,
    };
  };

  app.post("/task/project-plan", async (c) => {
    const body = parseWithZod(projectPlanCreateBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").create({
      ...planAuth(c),
      name: body.name,
      color: body.color,
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/project-plan/list", async (c) => {
    const auth = planAuth(c);
    const result = await service(c, "projectPlan").list(auth.organization_id, auth);
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/project-plan", async (c) => {
    const body = parseWithZod(projectPlanUpdateBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").update({
      ...planAuth(c),
      id: body.id,
      name: body.name,
      color: body.color,
    });
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/project-plan", async (c) => {
    const body = await looseBody(c);
    const query = parseWithZod(projectPlanDetailQuerySchema, {
      plan_id: firstQueryValue(body.plan_id ?? c.req.query("plan_id")),
    });
    const auth = planAuth(c);
    const result = await service(c, "projectPlan").detail(
      query.plan_id,
      auth.organization_id,
      auth,
    );
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/project-plan", async (c) => {
    const body = await looseBody(c);
    const params = parseWithZod(projectPlanDeleteParamsSchema, {
      id: firstQueryValue(body.id ?? c.req.query("id")),
    });
    const result = await service(c, "projectPlan").delete({ id: params.id, ...planAuth(c) });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/project-plan/task", async (c) => {
    const body = parseWithZod(projectPlanAddTaskBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").addTask({
      plan_id: body.plan_id,
      task_id: body.task_id,
      ...planAuth(c),
    });
    return c.json(createSuccessResponse(result), 201);
  });

  app.get("/task/project-plan/task/list", async (c) => {
    const body = await looseBody(c);
    const query = parseWithZod(projectPlanListTasksQuerySchema, {
      plan_id: firstQueryValue(body.plan_id ?? c.req.query("plan_id")),
    });
    const auth = planAuth(c);
    const result = await service(c, "projectPlan").listTasks(
      query.plan_id,
      auth.organization_id,
      auth,
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/task/project-plan/task", async (c) => {
    const body = parseWithZod(projectPlanReorderTaskBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").reorderTask({
      plan_id: body.plan_id,
      plan_task_id: body.plan_task_id,
      direction: body.direction,
      ...planAuth(c),
    });
    return c.json(createSuccessResponse(result));
  });

  app.delete("/task/project-plan/task", async (c) => {
    const body = parseWithZod(projectPlanDeleteTaskBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").deleteTask({
      plan_id: body.plan_id,
      plan_task_id: body.plan_task_id,
      ...planAuth(c),
    });
    return c.json(createSuccessResponse(result));
  });

  app.post("/task/project-plan/hire", async (c) => {
    const body = parseWithZod(projectPlanHireBodySchema, await jsonBody(c));
    const result = await service(c, "projectPlan").hirePlan({
      ...planAuth(c),
      project_id: body.project_id,
      plan_id: body.plan_id,
    });
    return c.json(createSuccessResponse(result));
  });

  // depsTasks.routes.ts
  app.get("/task/deps/list", async (c) => {
    const who = actor(c);
    requireIntegracaoRouteAccess("GET", "/task/deps/list", {
      userId: who.user_id,
      level: who.integracaoLevel,
      organizationId: who.organization_id,
      isOwner: who.isOwner,
    });
    const result = await service(c, "depsTasks").listDepartmentsWithTaskModels(who.organization_id);
    return c.json(createSuccessResponse(result));
  });

  app.get("/task/deps/options", async (c) => {
    const who = actor(c);
    requireIntegracaoRouteAccess("GET", "/task/deps/options", {
      userId: who.user_id,
      level: who.integracaoLevel,
      organizationId: who.organization_id,
      isOwner: who.isOwner,
    });
    const { department_id } = parseWithZod(taskModelOptionsQuerySchema, c.req.query());
    const result = await service(c, "depsTasks").listTaskModelOptions(
      who.organization_id,
      department_id,
    );
    return c.json(createSuccessResponse(result));
  });

  // internalReporting.routes.ts
  const grantInput = (c: TaskContext) => {
    const env = envOf(c);
    return {
      reportsInternalToken: env.REPORTS_INTERNAL_TOKEN,
      reportsGrantSecret: env.REPORTS_GRANT_SECRET,
      token: c.req.header(INTERNAL_SERVICE_TOKEN_HEADER),
      grant: c.req.header(REPORTS_GRANT_HEADER),
      signature: c.req.header(REPORTS_GRANT_SIGNATURE_HEADER),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
    };
  };

  app.get("/internal/reporting/catalog", (c) => {
    verifyReportingGrant({
      ...grantInput(c),
      operation: "catalog",
      source: "integracao.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(publishedReportingCatalog));
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await jsonBody(c));
    const grant = verifyReportingGrant({
      ...grantInput(c),
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const result = await service(c, "reporting").extract({
      organizationId: grant.organization_id,
      source: body.source,
      fields: body.fields,
      limit: body.limit,
      ...(body.query ? { query: body.query } : {}),
    });
    return c.json(createSuccessResponse(result));
  });

  // internalCommercialTaskBilling.routes.ts e internalCommercialProspecting.routes.ts
  app.post("/internal/commercial/task-billing", async (c) => {
    requireCommercialServiceToken(c, envOf(c));
    const event = parseWithZod(commercialTaskBillingEventSchema, await jsonBody(c));
    return c.json(createSuccessResponse(await service(c, "commercialTaskBilling").apply(event)));
  });

  app.post("/internal/commercial/prospecting-close", async (c) => {
    requireCommercialServiceToken(c, envOf(c));
    const event = parseWithZod(commercialProspectingCloseEventSchema, await jsonBody(c));
    return c.json(
      createSuccessResponse(await service(c, "commercialProspectingClose").apply(event)),
    );
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );

  app.onError((error, c) => {
    // Erro esperado vira resposta; o inesperado vira 500 genérico e precisa ficar no log.
    if (!(error instanceof ServiceError)) {
      console.error("Erro inesperado no task-service", {
        requestId: c.req.header(REQUEST_ID_HEADER),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        userId: c.get("auth")?.userId,
        organizationId: c.get("auth")?.organizationId,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no task-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
