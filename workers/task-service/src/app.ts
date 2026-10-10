import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import {
  type ModulePermissionKey,
  normalizeModulePermission,
  parseWithZod,
  reportingQueryFields,
  requireAuthenticatedRequestContext,
  requireIntegracaoRouteAccess,
  taskReportingCatalog,
  zNonEmptyText,
} from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import {
  agendaCreateBodySchema,
  agendaDeleteBodySchema,
  agendaListQuerySchema,
  agendaUpdateBodySchema,
} from "@workspace/task-service/src/schemas/agenda.schemas.js";
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
import {
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/task-service/src/schemas/internalReporting.schemas.js";
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
import { AGENDA_LEVEL } from "@workspace/task-service/src/services/agendaService.js";
import {
  TASK_ATTACHMENT_MIME_TYPES,
  type TaskAttachmentMimeType,
} from "@workspace/task-service/src/services/taskAttachmentStorage.js";
import { DOCX_MIME_TYPE, extractDocxText } from "@workspace/task-service/src/utils/docx.js";
import { extractPdfText, PDF_MIME_TYPE } from "@workspace/task-service/src/utils/pdf.js";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateTaskRequest } from "./auth.js";
import type { TaskWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";
import { createTaskServices, type TaskServices } from "./services.js";

export type { TaskWorkerEnv } from "./env.js";

type TaskContext = { Bindings: TaskWorkerEnv; Variables: { auth: WorkerAuthContext } };
type TaskOptions = { env?: TaskWorkerEnv; prisma?: unknown };

type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

/** O `req` que os handlers do Node leem, montado a partir da requisição do Worker. */
type TaskRequest = {
  // biome-ignore lint/suspicious/noExplicitAny: espelha o `req.body` do Express.
  body: any;
  // biome-ignore lint/suspicious/noExplicitAny: espelha o `req.query` do Express.
  query: Record<string, any>;
  file?: UploadedFile;
  user_id: string;
  organization_id: string;
  permission?: number;
  user_type?: "owner" | "admin" | "user";
  modules?: Record<string, number>;
  get(name: string): string | undefined;
};

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";

const publishedReportingCatalog = {
  ...taskReportingCatalog,
  sources: taskReportingCatalog.sources.map(({ keys: _keys, ...source }) => source),
};

/** Query no formato do parser do Express: chave repetida (ou `chave[]`) vira array. */
function expressQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    const name = key.endsWith("[]") ? key.slice(0, -2) : key;
    query[name] = values.length > 1 || key.endsWith("[]") ? values : values[0];
  }
  return query;
}

/** `express.json()`: só lê JSON declarado; sem corpo, `{}`. JSON inválido é 400, como nos Workers. */
async function expressJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/([\w.+-]+\+)?json\b/iu.test(contentType)) return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function taskRequest(c: Context<TaskContext>, body: Record<string, unknown>): TaskRequest {
  const auth = c.get("auth");
  const { claims } = auth;
  return {
    body,
    query: expressQuery(new URL(c.req.url)),
    user_id: auth.userId,
    organization_id: auth.organizationId ?? "",
    permission: claims.permission,
    user_type: claims.type,
    modules: claims.modules as Record<string, number> | undefined,
    get: (name) => c.req.header(name),
  };
}

const integracao = (r: TaskRequest) => normalizeModulePermission(r.modules?.integracao);
const isOwner = (r: TaskRequest) => r.user_type === "owner";

/** Escopo da agenda compartilhada: o nível vem do módulo pedido, nunca de outro. */
function agendaScope(r: TaskRequest, module: ModulePermissionKey) {
  const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
  return {
    userId: user_id,
    organizationId: organization_id,
    module,
    level: isOwner(r) ? AGENDA_LEVEL.OWNER : normalizeModulePermission(r.modules?.[module]),
  };
}

/**
 * `multer({ limits, fileFilter }).single(field)`: mesmos erros e na mesma ordem. Campos de
 * texto vão para o body; o arquivo, para `file`.
 */
async function multipartUpload(
  request: Request,
  options: {
    field: string;
    maxFileBytes: number;
    maxFields?: number;
    accept(file: File): boolean;
  },
): Promise<{ body: Record<string, unknown>; file?: UploadedFile }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ServiceError(400, "Upload inválido.");
  }
  const body: Record<string, unknown> = {};
  let file: UploadedFile | undefined;
  let fields = 0;
  const entries: Array<[string, FormDataEntryValue]> = [];
  form.forEach((value, name) => {
    entries.push([name, value]);
  });
  for (const [name, value] of entries) {
    if (typeof value === "string") {
      fields += 1;
      if (options.maxFields !== undefined && fields > options.maxFields) {
        throw new ServiceError(400, "Upload inválido.");
      }
      const current = body[name];
      body[name] =
        current === undefined
          ? value
          : Array.isArray(current)
            ? [...current, value]
            : [current, value];
      continue;
    }
    if (name !== options.field || file) throw new ServiceError(400, "Upload inválido.");
    if (!options.accept(value)) throw new ServiceError(400, "Tipo de arquivo não permitido.");
    if (value.size > options.maxFileBytes) {
      throw new ServiceError(400, "Arquivo excede o limite de 10 MB.");
    }
    file = {
      buffer: Buffer.from(await value.arrayBuffer()),
      mimetype: value.type,
      originalname: value.name,
      size: value.size,
    };
  }
  return { body, file };
}

const MEETING_MINUTES_FORMATS: Record<
  string,
  { mimeTypes: readonly string[]; extract?: (file: Buffer) => string }
> = {
  ".txt": { mimeTypes: ["text/plain"] },
  ".md": { mimeTypes: ["text/markdown", "text/plain", "text/x-markdown"] },
  ".docx": { mimeTypes: [DOCX_MIME_TYPE], extract: extractDocxText },
  ".pdf": { mimeTypes: [PDF_MIME_TYPE], extract: extractPdfText },
};

function meetingMinutesFormat(originalname: string) {
  const dot = originalname.lastIndexOf(".");
  const extension = dot > 0 ? originalname.slice(dot).toLowerCase() : "";
  return MEETING_MINUTES_FORMATS[extension];
}

function decodeUtf8(file: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file);
  } catch {
    throw new ServiceError(400, "O arquivo da Ata deve conter texto UTF-8 válido.");
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padded = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function equalText(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const actual = new TextEncoder().encode(left);
  const expected = new TextEncoder().encode(right);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function verifyGrant(input: {
  env: TaskWorkerEnv;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}) {
  if (!equalText(input.token, input.env.REPORTS_INTERNAL_TOKEN ?? "")) {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (!input.grant) throw new ServiceError(403, "Grant de relatórios inválido.");
  let payload: ReturnType<typeof internalReportingGrantSchema.parse>;
  try {
    payload = internalReportingGrantSchema.parse(JSON.parse(decodeBase64Url(input.grant)));
    if (!equalText(base64Url(new TextEncoder().encode(canonicalJson(payload))), input.grant)) {
      throw new Error("grant não canônico");
    }
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  if (
    !equalText(input.signature, await hmacHex(input.grant, input.env.REPORTS_GRANT_SECRET ?? ""))
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    payload.fields.length === input.fields.length &&
    payload.fields.every((field, index) => field === input.fields[index]);
  if (
    payload.operation !== input.operation ||
    payload.source !== input.source ||
    !fieldsMatch ||
    payload.request_id !== input.requestId ||
    payload.body_sha256 !== (await digestHex(canonicalJson(input.body))) ||
    payload.issued_at > now ||
    payload.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return payload;
}

function idempotencyKey(r: TaskRequest): string {
  const value = r.get("Idempotency-Key");
  return value
    ? parseWithZod(zNonEmptyText("Idempotency-Key").max(255), value)
    : crypto.randomUUID();
}

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createTaskWorkerApp(options: TaskOptions = {}) {
  const app = new Hono<TaskContext>();
  const envOf = (c: Context<TaskContext>) => options.env ?? c.env;

  function withServices<T>(
    c: Context<TaskContext>,
    callback: (services: TaskServices) => Promise<T>,
  ): Promise<T> {
    const env = envOf(c);
    if (options.prisma) return callback(createTaskServices(options.prisma, env));
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new ServiceError(
        503,
        "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
      );
    }
    return withWorkerPrisma(env, PrismaClient, (prisma) =>
      callback(createTaskServices(prisma, env)),
    );
  }

  /** Handler no formato dos do Node: recebe o `req`, os serviços e devolve status + dado. */
  const route =
    (
      handler: (r: TaskRequest, services: TaskServices) => Promise<unknown>,
      { status = 200 }: { status?: ContentfulStatusCode } = {},
    ) =>
    async (c: Context<TaskContext>) => {
      const r = taskRequest(c, await expressJsonBody(c.req.raw));
      const data = await withServices(c, (services) => handler(r, services));
      return c.json(createSuccessResponse(data), status);
    };

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "task-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "task-service" })),
  );

  app.use("*", async (c, next) => {
    if (c.req.path === "/task" || c.req.path.startsWith("/task/")) {
      c.set("auth", await authenticateTaskRequest(c.req.raw, envOf(c)));
    }
    await next();
  });

  // --- taskModel.routes.ts
  app.post(
    "/task/model",
    route(
      async (r, s) => {
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
        } = r.body;
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        const responsibleSequence = parseTaskModelResponsibleSequence({
          responsible_id,
          responsible2_id: responsible2_id ?? null,
          responsible3_id: responsible3_id ?? null,
        });
        if (!name || !department_id || !responsible_id || !billing || prevision === undefined) {
          throw new ServiceError(
            400,
            "Campos obrigatÃ³rios: name, department_id, responsible_id, billing, prevision.",
          );
        }
        return s.model().createModel({
          user_id,
          organization_id,
          name,
          department_id,
          responsible_id: responsibleSequence.responsible_id,
          responsible2_id: responsibleSequence.responsible2_id,
          responsible3_id: responsibleSequence.responsible3_id,
          observations: observations ?? null,
          billing,
          prevision: Number(prevision),
          type: type ?? null,
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/model",
    route(async (r, s) => {
      const task_id = (r.body.task_id ?? r.query.task_id) as string;
      const { organization_id } = requireAuthenticatedRequestContext(r);
      if (!task_id) {
        throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.model().detailModel(task_id, organization_id, {
        userId: r.user_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.put(
    "/task/model",
    route(async (r, s) => {
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
      } = r.body;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
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
          "Campos obrigatÃ³rios: task_id, name, department_id, responsible_id, billing, prevision.",
        );
      }
      return s.model().updateModel({
        user_id,
        organization_id,
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
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.get(
    "/task/model/list",
    route(async (r, s) => {
      const { organization_id } = requireAuthenticatedRequestContext(r);
      const paginationRequested = r.query.page !== undefined || r.query.limit !== undefined;
      const query = parseWithZod(taskModelListQuerySchema, {
        ...r.query,
        type: r.query.type ?? r.body?.type,
        billing: r.query.billing ?? r.body?.billing,
      });
      return s.model().listModel({
        organizationId: organization_id,
        userId: r.user_id,
        paginationRequested,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
        ...query,
      });
    }),
  );

  app.delete(
    "/task/model",
    route(async (r, s) => {
      const task_id = (r.body.task_id ?? r.query.task_id) as string;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      if (!task_id) {
        throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.model().deleteModel({
        task_id,
        user_id,
        organization_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskDependent.routes.ts
  app.post(
    "/task/model/dependent",
    route(
      async (r, s) => {
        const { task_model_id, dependent_id, wait, observation } = r.body;
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        if (!task_model_id || !dependent_id || wait === undefined || observation === undefined) {
          throw new ServiceError(
            400,
            "Campos obrigatÃ³rios: task_model_id, dependent_id, wait, observation.",
          );
        }
        return s.dependent().addDependent({
          user_id,
          organization_id,
          task_model_id,
          dependent_id,
          wait: Boolean(wait),
          observation: String(observation),
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/model/dependent",
    route(async (r, s) => {
      const task_model_id = (r.body.task_model_id ?? r.query.task_model_id) as string;
      const { organization_id } = requireAuthenticatedRequestContext(r);
      if (!task_model_id) {
        throw new ServiceError(400, "task_model_id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.dependent().listDependents(task_model_id, organization_id, {
        userId: r.user_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.delete(
    "/task/model/dependent",
    route(async (r, s) => {
      const id = (r.body.id ?? r.query.id) as string;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      if (!id) {
        throw new ServiceError(400, "id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.dependent().deleteDependent({
        id,
        user_id,
        organization_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskIntegrationRegularize.routes.ts
  app.post(
    "/task/integration",
    route(
      async (r, s) => {
        const { task_model_id, referring, referring_type } = parseWithZod(
          taskIntegrationRegularizeBodySchema,
          r.body,
        );
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        return s.integration().createLink({
          user_id,
          organization_id,
          task_model_id,
          referring,
          referring_type,
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.delete(
    "/task/integration",
    route(async (r, s) => {
      const { integration_id } = parseWithZod(taskIntegrationRegularizeDeleteBodySchema, r.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      return s.integration().removeLink({
        user_id,
        organization_id,
        integration_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.get(
    "/task/integration",
    route(async (r, s) => {
      const { task_model_id } = parseWithZod(taskIntegrationRegularizeListQuerySchema, r.query);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      return s.integration().list(organization_id, task_model_id, {
        userId: user_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskLifecycle.routes.ts
  app.put(
    "/task/conclusion",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const body = parseWithZod(integracaoTaskConclusionBodySchema, r.body);
      return s.lifecycle().concludeTask({
        user_id,
        organization_id,
        body: {
          ...body,
          observations: body.observations ?? "",
          justification: body.justification ?? "",
        },
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.post(
    "/task/complete-request",
    route(
      async (r, s) => {
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        const body = parseWithZod(integracaoTaskCompletionRequestBodySchema, r.body);
        return s.lifecycle().requestTaskCompletion({
          user_id,
          organization_id,
          task_id: body.task_id,
          reason: body.reason,
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.put(
    "/task/complete-request",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, r.body);
      return s.lifecycle().approveTaskCompletion({
        user_id,
        organization_id,
        task_id: parsed.task_id,
        ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
        ...(parsed.decision ? { decision: parsed.decision } : {}),
        ...(parsed.reason ? { reason: parsed.reason } : {}),
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.delete(
    "/task/complete-request",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, r.body);
      return s.lifecycle().cancelTaskCompletion({
        user_id,
        organization_id,
        task_id: parsed.task_id,
        ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.get(
    "/task/complete-request/list",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const query = parseWithZod(integracaoTaskCompletionRequestListQuerySchema, r.query);
      return s.lifecycle().listTaskCompletionRequests({
        user_id,
        organization_id,
        task_id: query.task_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.put(
    "/task/reopen",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const body = parseWithZod(integracaoTaskReopenBodySchema, r.body);
      return s.lifecycle().reopenTask({
        user_id,
        organization_id,
        task_id: body.task_id,
        reason: body.reason,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskPostponement.routes.ts
  app.post(
    "/task/postponement",
    route(
      async (r, s) => {
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        const body = parseWithZod(integracaoTaskPostponementBodySchema, r.body);
        return s.postponement().create({
          user_id,
          organization_id,
          task_id: body.task_id,
          new_prevision_date: body.new_prevision_date,
          justification: body.justification,
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/postponement/list",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const query = parseWithZod(integracaoTaskPostponementListQuerySchema, r.query);
      return s.postponement().list({
        user_id,
        organization_id,
        task_id: query.task_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskOperationalNotification.routes.ts
  app.get(
    "/task/notifications",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      requireIntegracaoRouteAccess("GET", "/task/notifications", {
        userId: user_id,
        organizationId: organization_id,
        level: integracao(r),
        isOwner: isOwner(r),
      });
      return s.notification().list({ user_id, organization_id });
    }),
  );

  app.put(
    "/task/notifications/read",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const body = parseWithZod(taskOperationalNotificationReadBodySchema, r.body);
      requireIntegracaoRouteAccess("PUT", "/task/notifications/read", {
        userId: user_id,
        organizationId: organization_id,
        level: integracao(r),
        isOwner: isOwner(r),
      });
      return s.notification().markRead({
        user_id,
        organization_id,
        notification_id: body.notification_id,
      });
    }),
  );

  // --- taskAttachment.routes.ts (multer: memória, 10 MB, 1 arquivo em `file`)
  app.post("/task/attachment", async (c) => {
    const upload = await multipartUpload(c.req.raw, {
      field: "file",
      maxFileBytes: MAX_ATTACHMENT_SIZE_BYTES,
      accept: (file) => TASK_ATTACHMENT_MIME_TYPES.includes(file.type as TaskAttachmentMimeType),
    });
    if (!upload.file) throw new ServiceError(400, "Arquivo é obrigatório.");
    validateUploadFileSignature(upload.file);
    const r = { ...taskRequest(c, upload.body), file: upload.file };
    const data = await withServices(c, (s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const body = parseWithZod(taskAttachmentBodySchema, r.body);
      const file = r.file;
      if (!file) throw new ServiceError(400, "Arquivo é obrigatório.");
      return s.attachment().upload({
        user_id,
        organization_id,
        task_id: body.task_id,
        file: {
          buffer: file.buffer,
          mimetype: file.mimetype as TaskAttachmentMimeType,
          originalname: file.originalname,
        },
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    });
    return c.json(createSuccessResponse(data), 201);
  });

  app.get(
    "/task/attachment/list",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const query = parseWithZod(taskAttachmentListQuerySchema, r.query);
      return s.attachment().list({
        user_id,
        organization_id,
        task_id: query.task_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.get(
    "/task/attachment/access",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const query = parseWithZod(taskAttachmentQuerySchema, r.query);
      return s.attachment().createAccessUrl({
        user_id,
        organization_id,
        task_id: query.task_id,
        attachment_id: query.attachment_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.delete(
    "/task/attachment",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const body = parseWithZod(taskAttachmentDeleteBodySchema, r.body);
      return s.attachment().remove({
        user_id,
        organization_id,
        task_id: body.task_id,
        attachment_id: body.attachment_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- taskFinanceiro.routes.ts
  const financeiroContext = (r: TaskRequest) => {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
    return {
      user_id,
      organization_id,
      integracao_level: integracao(r),
      financeiro_level: normalizeModulePermission(r.modules?.financeiro),
      is_owner: isOwner(r),
    };
  };

  app.put(
    "/task/financeiro",
    route(async (r, s) => {
      const body = parseWithZod(financeiroTaskUpdateBodySchema, r.body);
      return s.financeiro().settle({
        ...financeiroContext(r),
        task_ids: [body.task_id],
        idempotency_key: idempotencyKey(r),
      });
    }),
  );

  app.get(
    "/task/financeiro/queue",
    route(async (r, s) => {
      const query = parseWithZod(financeiroQueueQuerySchema, r.query);
      return s.financeiro().listQueue({ ...financeiroContext(r), ...query });
    }),
  );

  app.put(
    "/task/financeiro/collectors",
    route(async (r, s) => {
      const body = parseWithZod(financeiroCollectorsBodySchema, r.body);
      return s.financeiro().setCollectors({ ...financeiroContext(r), ...body });
    }),
  );

  app.get(
    "/task/financeiro/collectors",
    route(async (r, s) => {
      const query = parseWithZod(financeiroCollectorsQuerySchema, r.query);
      return s.financeiro().listCollectors({ ...financeiroContext(r), ...query });
    }),
  );

  app.post(
    "/task/financeiro/settle",
    route(async (r, s) => {
      const body = parseWithZod(financeiroSettlementBodySchema, r.body);
      return s.financeiro().settle({
        ...financeiroContext(r),
        ...body,
        idempotency_key: idempotencyKey(r),
      });
    }),
  );

  app.post(
    "/task/financeiro/express",
    route(async (r, s) => {
      const body = parseWithZod(financeiroExpressBodySchema, r.body);
      return s.financeiro().settleExpress({
        ...financeiroContext(r),
        ...body,
        idempotency_key: idempotencyKey(r),
      });
    }),
  );

  // --- taskCrud.routes.ts
  app.post(
    "/task",
    route(
      async (r, s) => {
        const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
        const body = parseWithZod(integracaoTaskCreateBodySchema, r.body);
        return s.crud().createTask({
          user_id,
          organization_id,
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
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
        });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/list",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const query = parseWithZod(taskListQuerySchema, r.query);
      return s.crud().listTasks({
        organization_id,
        user_id,
        ...query,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.put(
    "/task",
    route(async (r, s) => {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      const { task_id, ...patch } = parseWithZod(integracaoTaskUpdateBodySchema, r.body);
      return s.crud().updateTask({
        user_id,
        organization_id,
        task_id,
        ...patch,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.get(
    "/task",
    route(async (r, s) => {
      const task_id = (r.body.task_id ?? r.query.task_id) as string;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      if (!task_id) {
        throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.crud().detailTask(task_id, organization_id, {
        user_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  app.delete(
    "/task",
    route(async (r, s) => {
      const task_id = (r.body.task_id ?? r.query.task_id) as string;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
      if (!task_id) {
        throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
      }
      return s.crud().deleteTask({
        task_id,
        user_id,
        organization_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
      });
    }),
  );

  // --- projectWizard.routes.ts
  app.post(
    "/task/project-wizard/preview",
    route(async (r, s) => {
      const body = parseWithZod(projectWizardPreviewBodySchema, r.body);
      const auth = requireAuthenticatedRequestContext(r);
      return s.wizard().preview({
        userId: auth.user_id,
        organizationId: auth.organization_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
        tasks: body.tasks,
      });
    }),
  );

  app.post(
    "/task/project-wizard",
    route(
      async (r, s) => {
        const body = parseWithZod(projectWizardCreateBodySchema, r.body);
        const key = parseWithZod(idempotencyKeySchema, r.get("Idempotency-Key"));
        const auth = requireAuthenticatedRequestContext(r);
        return s.wizard().create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          integracaoLevel: integracao(r),
          isOwner: isOwner(r),
          userType: r.user_type,
          modules: r.modules,
          idempotencyKey: key,
          ...body,
        });
      },
      { status: 201 },
    ),
  );

  app.post("/task/project-wizard/extract-tasks", async (c) => {
    const contentType = c.req.header("content-type") ?? "";
    let body: Record<string, unknown>;
    if (/^multipart\/form-data\b/iu.test(contentType)) {
      const upload = await multipartUpload(c.req.raw, {
        field: "file",
        maxFileBytes: MEETING_MINUTES_MAX_SOURCE_BYTES,
        maxFields: 4,
        accept: (file) => meetingMinutesFormat(file.name)?.mimeTypes.includes(file.type) ?? false,
      });
      const file = upload.file;
      if (!file || file.size === 0) {
        throw new ServiceError(400, "O arquivo da Ata é obrigatório e não pode estar vazio.");
      }
      let content: string;
      try {
        content = (meetingMinutesFormat(file.originalname)?.extract ?? decodeUtf8)(file.buffer);
        if (content.includes("\0")) {
          throw new ServiceError(400, "O arquivo da Ata não pode conter NUL.");
        }
        if (!content.trim()) {
          throw new ServiceError(400, "O arquivo da Ata não contém texto.");
        }
      } catch (error) {
        throw error instanceof ServiceError
          ? error
          : new ServiceError(400, "O arquivo da Ata não pôde ser lido.");
      }
      body = { ...upload.body, content };
    } else {
      body = await expressJsonBody(c.req.raw);
    }
    const r = taskRequest(c, parseWithZod(projectWizardExtractTasksBodySchema, body));
    const data = await withServices(c, (s) => {
      const auth = requireAuthenticatedRequestContext(r);
      return s.extraction().extractTasks({
        userId: auth.user_id,
        organizationId: auth.organization_id,
        integracaoLevel: integracao(r),
        isOwner: isOwner(r),
        ...r.body,
      });
    });
    return c.json(createSuccessResponse(data), 200);
  });

  // --- projectPlan.routes.ts
  const planAuth = (r: TaskRequest) => {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(r);
    return { user_id, organization_id, integracaoLevel: integracao(r), isOwner: isOwner(r) };
  };

  app.post(
    "/task/project-plan",
    route(
      async (r, s) => {
        const body = parseWithZod(projectPlanCreateBodySchema, r.body);
        return s.projectPlan().create({ ...planAuth(r), name: body.name, color: body.color });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/project-plan/list",
    route(async (r, s) => {
      const auth = planAuth(r);
      return s.projectPlan().list(auth.organization_id, auth);
    }),
  );

  app.put(
    "/task/project-plan",
    route(async (r, s) => {
      const body = parseWithZod(projectPlanUpdateBodySchema, r.body);
      return s.projectPlan().update({
        ...planAuth(r),
        id: body.id,
        name: body.name,
        color: body.color,
      });
    }),
  );

  app.get(
    "/task/project-plan",
    route(async (r, s) => {
      const query = parseWithZod(projectPlanDetailQuerySchema, {
        plan_id: firstQueryValue(r.body?.plan_id ?? r.query.plan_id),
      });
      const auth = planAuth(r);
      return s.projectPlan().detail(query.plan_id, auth.organization_id, auth);
    }),
  );

  app.delete(
    "/task/project-plan",
    route(async (r, s) => {
      const params = parseWithZod(projectPlanDeleteParamsSchema, {
        id: firstQueryValue(r.body?.id ?? r.query.id),
      });
      const { user_id, organization_id, integracaoLevel, isOwner: owner } = planAuth(r);
      return s.projectPlan().delete({
        id: params.id,
        user_id,
        organization_id,
        integracaoLevel,
        isOwner: owner,
      });
    }),
  );

  app.post(
    "/task/project-plan/task",
    route(
      async (r, s) => {
        const body = parseWithZod(projectPlanAddTaskBodySchema, r.body);
        return s.projectPlan().addTask({
          plan_id: body.plan_id,
          task_id: body.task_id,
          ...planAuth(r),
        });
      },
      { status: 201 },
    ),
  );

  app.get(
    "/task/project-plan/task/list",
    route(async (r, s) => {
      const query = parseWithZod(projectPlanListTasksQuerySchema, {
        plan_id: firstQueryValue(r.body?.plan_id ?? r.query.plan_id),
      });
      const auth = planAuth(r);
      return s.projectPlan().listTasks(query.plan_id, auth.organization_id, auth);
    }),
  );

  app.put(
    "/task/project-plan/task",
    route(async (r, s) => {
      const body = parseWithZod(projectPlanReorderTaskBodySchema, r.body);
      return s.projectPlan().reorderTask({
        plan_id: body.plan_id,
        plan_task_id: body.plan_task_id,
        direction: body.direction,
        ...planAuth(r),
      });
    }),
  );

  app.delete(
    "/task/project-plan/task",
    route(async (r, s) => {
      const body = parseWithZod(projectPlanDeleteTaskBodySchema, r.body);
      return s.projectPlan().deleteTask({
        plan_id: body.plan_id,
        plan_task_id: body.plan_task_id,
        ...planAuth(r),
      });
    }),
  );

  app.post(
    "/task/project-plan/hire",
    route(async (r, s) => {
      const body = parseWithZod(projectPlanHireBodySchema, r.body);
      return s.projectPlan().hirePlan({
        ...planAuth(r),
        project_id: body.project_id,
        plan_id: body.plan_id,
      });
    }),
  );

  // --- depsTasks.routes.ts
  app.get(
    "/task/deps/list",
    route(async (r, s) => {
      const { organization_id } = requireAuthenticatedRequestContext(r);
      requireIntegracaoRouteAccess("GET", "/task/deps/list", {
        userId: r.user_id,
        level: integracao(r),
        organizationId: organization_id,
        isOwner: isOwner(r),
      });
      return s.deps().listDepartmentsWithTaskModels(organization_id);
    }),
  );

  app.get(
    "/task/deps/options",
    route(async (r, s) => {
      const { organization_id } = requireAuthenticatedRequestContext(r);
      requireIntegracaoRouteAccess("GET", "/task/deps/options", {
        userId: r.user_id,
        level: integracao(r),
        organizationId: organization_id,
        isOwner: isOwner(r),
      });
      const { department_id } = parseWithZod(taskModelOptionsQuerySchema, r.query);
      return s.deps().listTaskModelOptions(organization_id, department_id);
    }),
  );

  // --- agenda compartilhada: uma agenda só, vista pelo departamento do módulo pedido.
  app.get(
    "/task/agenda",
    route(async (r, s) => {
      const { module, month } = parseWithZod(agendaListQuerySchema, r.query);
      return s.agenda().list(agendaScope(r, module), month);
    }),
  );

  app.post(
    "/task/agenda",
    route(
      async (r, s) => {
        const { module, ...event } = parseWithZod(agendaCreateBodySchema, r.body);
        return s.agenda().create(agendaScope(r, module), event);
      },
      { status: 201 },
    ),
  );

  app.put(
    "/task/agenda",
    route(async (r, s) => {
      const { module, agenda_id, ...event } = parseWithZod(agendaUpdateBodySchema, r.body);
      return s.agenda().update(agendaScope(r, module), agenda_id, event);
    }),
  );

  app.delete(
    "/task/agenda",
    route(async (r, s) => {
      const { module, agenda_id } = parseWithZod(agendaDeleteBodySchema, r.body);
      return s.agenda().remove(agendaScope(r, module), agenda_id);
    }),
  );

  // --- internalReporting.routes.ts
  app.get("/internal/reporting/catalog", async (c) => {
    await verifyGrant({
      env: envOf(c),
      token: c.req.header(INTERNAL_SERVICE_TOKEN_HEADER),
      grant: c.req.header(REPORTS_GRANT_HEADER),
      signature: c.req.header(REPORTS_GRANT_SIGNATURE_HEADER),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "catalog",
      source: "integracao.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(publishedReportingCatalog));
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await expressJsonBody(c.req.raw));
    const grant = await verifyGrant({
      env: envOf(c),
      token: c.req.header(INTERNAL_SERVICE_TOKEN_HEADER),
      grant: c.req.header(REPORTS_GRANT_HEADER),
      signature: c.req.header(REPORTS_GRANT_SIGNATURE_HEADER),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const result = await withServices(c, (s) =>
      s.reporting().extract({
        organizationId: grant.organization_id,
        source: body.source,
        fields: body.fields,
        limit: body.limit,
        ...(body.query ? { query: body.query } : {}),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  // --- internalCommercial*.routes.ts
  const requireCommercialToken = (c: Context<TaskContext>) => {
    if (c.req.header(INTERNAL_SERVICE_TOKEN_HEADER) !== envOf(c).COMMERCIAL_SERVICE_TOKEN) {
      throw new ServiceError(403, "Acesso negado.");
    }
  };

  app.post("/internal/commercial/task-billing", async (c) => {
    requireCommercialToken(c);
    const event = parseWithZod(commercialTaskBillingEventSchema, await expressJsonBody(c.req.raw));
    const result = await withServices(c, (s) => s.commercialTaskBilling().apply(event));
    return c.json(createSuccessResponse(result));
  });

  app.post("/internal/commercial/prospecting-close", async (c) => {
    requireCommercialToken(c);
    const event = parseWithZod(
      commercialProspectingCloseEventSchema,
      await expressJsonBody(c.req.raw),
    );
    const result = await withServices(c, (s) => s.commercialProspectingClose().apply(event));
    return c.json(createSuccessResponse(result));
  });

  app.onError((error, c) => {
    const normalizedError =
      error instanceof ServiceError
        ? error
        : typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number" &&
            "message" in error &&
            typeof error.message === "string"
          ? new ServiceError(error.statusCode, error.message)
          : error;
    const serialized = serializeError(normalizedError, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no task-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
