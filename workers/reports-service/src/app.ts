import {
  AUTH_SESSION_COOKIE_NAME,
  authenticateWorkerRequest,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  hashCsrfToken,
  readCookie,
  validateWorkerSession,
  verifyCsrfToken,
  type WorkerAuthContext,
  WorkerAuthenticationError,
  WorkerSessionValidationError,
  withWorkerPrisma,
} from "@workspace/runtime";
import {
  createSuccessResponse,
  parseWithZod,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import type { SourceCatalogService } from "../../../services/reports-service/src/catalog/sourceCatalogService.js";
import type { ReportCatalogScope } from "../../../services/reports-service/src/catalog/types.js";
import { UserAccessContextClient } from "../../../services/reports-service/src/integrations/userAccessContextClient.js";
import type { ReportsPrismaClient } from "../../../services/reports-service/src/prisma/index.js";
import {
  getReportingAccessContext,
  getReportingCatalogScope,
  type ReportingAccessContextClient,
} from "../../../services/reports-service/src/routes/reportingContext.js";
import { validateReportDefinitionBodySchema } from "../../../services/reports-service/src/schemas/reportComposition.schemas.js";
import {
  deleteReportJobSchema,
  reportJobListQuerySchema,
} from "../../../services/reports-service/src/schemas/reportHistory.schemas.js";
import {
  createReportJobIdempotencyHash,
  createReportJobSchema,
  reportJobIdempotencyKeySchema,
  reportJobIdParamsSchema,
} from "../../../services/reports-service/src/schemas/reportJob.schemas.js";
import {
  createReportModelSchema,
  type ReportModelDefinition,
  reportModelIdParamsSchema,
  updateReportModelSchema,
} from "../../../services/reports-service/src/schemas/reportModel.schemas.js";
import { reportPreviewRequestSchema } from "../../../services/reports-service/src/schemas/reportPreview.schemas.js";
import { reportRetentionPolicySchema } from "../../../services/reports-service/src/schemas/reportRetention.schemas.js";
import { ReportAuditService } from "../../../services/reports-service/src/services/reportAuditService.js";
import { ReportAuthorizationService } from "../../../services/reports-service/src/services/reportAuthorizationService.js";
import { ReportDefinitionService } from "../../../services/reports-service/src/services/reportDefinitionService.js";
import { ReportExportService } from "../../../services/reports-service/src/services/reportExportService.js";
import { ReportJobService } from "../../../services/reports-service/src/services/reportJobService.js";
import { ReportLifecycleService } from "../../../services/reports-service/src/services/reportLifecycleService.js";
import { ReportModelService } from "../../../services/reports-service/src/services/reportModelService.js";
import { ReportPreviewService } from "../../../services/reports-service/src/services/reportPreviewService.js";
import { ReportRetentionService } from "../../../services/reports-service/src/services/reportRetentionService.js";
import { ReportSnapshotService } from "../../../services/reports-service/src/services/reportSnapshotService.js";
import { createReportsAuditRecorder } from "./audit.js";
import { createReportsSourceCatalog } from "./catalog.js";
import type { ReportsWorkerEnv } from "./env.js";
import { toReportsServiceEnv } from "./env.js";
import { checkReportsDatabase, PrismaClient } from "./prisma.js";

type ReportsWorkerContext = {
  Bindings: ReportsWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type ReportsContext = Context<ReportsWorkerContext>;

type ReportsWorkerServices = {
  sourceCatalog: SourceCatalogService;
  definitionService: ReportDefinitionService;
  previewService: ReportPreviewService;
  authorizationService: ReportAuthorizationService;
  modelService: ReportModelService;
  jobService: ReportJobService;
  snapshotService: ReportSnapshotService;
  exportService: ReportExportService;
  retentionService: ReportRetentionService;
  lifecycleService: Pick<ReportLifecycleService, "deleteSnapshot">;
  accessContextClient: ReportingAccessContextClient;
};
type ReportsPureServices = Pick<
  ReportsWorkerServices,
  "sourceCatalog" | "definitionService" | "previewService" | "accessContextClient"
>;

interface ReportsWorkerOptions {
  env?: ReportsWorkerEnv;
  prisma?: Pick<ReportsPrismaClient, "$queryRaw">;
  sourceCatalog?: SourceCatalogService;
  accessContextClient?: ReportingAccessContextClient;
  services?: Partial<ReportsWorkerServices>;
}

const exportQuerySchema = z.object({ format: z.enum(["csv", "xlsx", "pdf"]) }).strict();
const snapshotQuerySchema = z
  .object({
    scope: z.enum(["personal", "library"]).default("personal"),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

function requestId(c: ReportsContext, fallback: string): string {
  return c.req.header(REQUEST_ID_HEADER) ?? fallback;
}

async function jsonBody(c: ReportsContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function jsonError(error: unknown, requestIdValue?: string): Response {
  console.error("reports-service request failed", error);
  const serialized = serializeError(error, {
    requestId: requestIdValue,
    fallbackMessage: "Erro interno no reports-service.",
  });
  return new Response(JSON.stringify(serialized.body), {
    status: serialized.statusCode,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}

function requireOrganizationAuth(
  options: ReportsWorkerOptions,
): MiddlewareHandler<ReportsWorkerContext> {
  return async (c, next) => {
    const env = options.env ?? c.env;
    let auth: WorkerAuthContext;
    try {
      auth = await authenticateWorkerRequest(c.req.raw, {
        jwtSecret: env.JWT_SECRET,
        allowBearer: true,
      });
    } catch (error) {
      if (error instanceof WorkerAuthenticationError)
        throw new ServiceError(401, "Não autenticado.");
      throw error;
    }
    if (auth.actorKind !== "organization" || !auth.organizationId) {
      throw new ServiceError(403, "A organização do relatório não está autorizada.");
    }
    const cookies = c.req.header("cookie") ?? undefined;
    const sessionToken = readCookie(cookies, AUTH_SESSION_COOKIE_NAME);
    if (sessionToken) {
      if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
        const csrfCookie = readCookie(cookies, CSRF_COOKIE_NAME);
        const csrfHeader = c.req.header(CSRF_HEADER_NAME);
        const expectedHash = auth.claims.csrf_hash;
        if (
          !csrfCookie ||
          !csrfHeader ||
          !expectedHash ||
          !(await verifyCsrfToken(csrfHeader, await hashCsrfToken(csrfCookie))) ||
          !(await verifyCsrfToken(csrfHeader, expectedHash))
        ) {
          throw new ServiceError(403, "Token CSRF inválido.");
        }
      }
      if (!env.USER_SERVICE || !env.USER_SERVICE_INTERNAL_TOKEN) {
        throw new ServiceError(503, "Validação de sessão indisponível para cookie.");
      }
      try {
        await validateWorkerSession(auth, env.USER_SERVICE, "cookie", {
          internalServiceToken: env.USER_SERVICE_INTERNAL_TOKEN,
        });
      } catch (error) {
        if (error instanceof WorkerSessionValidationError) {
          throw new ServiceError(error.statusCode, error.message);
        }
        throw error;
      }
    }
    c.set("auth", auth);
    await next();
  };
}

function actor(c: ReportsContext): { userId: string; organizationId: string } {
  const auth = c.get("auth");
  return { userId: auth.userId, organizationId: auth.organizationId };
}

function claimsAccessContext(auth: WorkerAuthContext): ReportingAccessContextClient {
  return {
    getAccessContext: async () => ({
      organization: { id: auth.organizationId },
      type: auth.claims.type ?? null,
      department: null,
      departmentModule: null,
      modules: auth.claims.modules,
      user: { name: auth.claims.name, login: auth.claims.login },
    }),
  };
}

function accessContextClient(c: ReportsContext, options: ReportsWorkerOptions) {
  if (options.accessContextClient) return options.accessContextClient;
  const env = options.env ?? c.env;
  return env.USER_SERVICE_URL
    ? new UserAccessContextClient(toReportsServiceEnv(env))
    : claimsAccessContext(c.get("auth"));
}

function createPureServices(c: ReportsContext, options: ReportsWorkerOptions) {
  const env = options.env ?? c.env;
  const sourceCatalog = options.sourceCatalog ?? createReportsSourceCatalog(env);
  const definitionService = new ReportDefinitionService(sourceCatalog);
  const contextClient = accessContextClient(c, options);
  return {
    sourceCatalog,
    definitionService,
    contextClient,
    previewService:
      options.services?.previewService ??
      new ReportPreviewService(
        sourceCatalog,
        definitionService,
        toReportsServiceEnv(env).previewRowLimit,
      ),
  };
}

async function withPureServices<T>(
  c: ReportsContext,
  options: ReportsWorkerOptions,
  callback: (services: ReportsPureServices) => Promise<T>,
): Promise<T> {
  const pure = createPureServices(c, options);
  return callback({
    sourceCatalog: pure.sourceCatalog,
    definitionService: pure.definitionService,
    previewService: pure.previewService,
    accessContextClient: pure.contextClient,
  });
}

function createAudit(prisma: ReportsPrismaClient, env: ReportsWorkerEnv) {
  return new ReportAuditService(
    prisma as never,
    createReportsAuditRecorder({
      enabled: env.AUDIT_ENABLED !== "false",
      service: env.AUDIT_SERVICE,
      serviceUrl: env.AUDIT_SERVICE_URL,
      serviceToken: env.AUDIT_SERVICE_TOKEN,
    }),
  );
}

async function withReportsServices<T>(
  c: ReportsContext,
  options: ReportsWorkerOptions,
  callback: (services: ReportsWorkerServices) => Promise<T>,
): Promise<T> {
  const env = options.env ?? c.env;
  const pure = createPureServices(c, options);
  if (options.services) {
    return callback({
      ...pure,
      accessContextClient: pure.contextClient,
      authorizationService: options.services.authorizationService as ReportAuthorizationService,
      modelService: options.services.modelService as ReportModelService,
      jobService: options.services.jobService as ReportJobService,
      snapshotService: options.services.snapshotService as ReportSnapshotService,
      exportService: options.services.exportService as ReportExportService,
      retentionService: options.services.retentionService as ReportRetentionService,
      lifecycleService: options.services.lifecycleService as Pick<
        ReportLifecycleService,
        "deleteSnapshot"
      >,
      ...(options.services as Partial<ReportsWorkerServices>),
    });
  }

  return withWorkerPrisma(env, PrismaClient, async (client) => {
    const prisma = client as unknown as ReportsPrismaClient;
    const audit = createAudit(prisma, env);
    const authorizationService = new ReportAuthorizationService(
      pure.contextClient,
      pure.definitionService,
    );
    const modelService = new ReportModelService(prisma);
    const jobService = new ReportJobService(prisma);
    const snapshotService = new ReportSnapshotService(prisma);
    const exportService = new ReportExportService(
      snapshotService,
      undefined,
      audit,
      jobService,
      authorizationService,
      pure.contextClient,
    );
    const retentionService = new ReportRetentionService(prisma, audit);
    const lifecycleService = new ReportLifecycleService(prisma as never, audit);
    return callback({
      ...pure,
      accessContextClient: pure.contextClient,
      authorizationService,
      modelService,
      jobService,
      snapshotService,
      exportService,
      retentionService,
      lifecycleService,
    });
  });
}

async function reportingAccess(
  services: Pick<ReportsWorkerServices, "accessContextClient">,
  c: ReportsContext,
  fallback: string,
) {
  return getReportingAccessContext(services.accessContextClient, {
    ...actor(c),
    requestId: requestId(c, fallback),
  });
}

async function reportingCatalogScope(
  services: Pick<ReportsWorkerServices, "accessContextClient">,
  c: ReportsContext,
  fallback: string,
): Promise<ReportCatalogScope> {
  return getReportingCatalogScope(services.accessContextClient, {
    ...actor(c),
    requestId: requestId(c, fallback),
  });
}

async function validateModelDefinition(
  services: ReportsWorkerServices,
  currentActor: { userId: string; organizationId: string },
  definition: ReportModelDefinition,
  requestIdValue: string,
) {
  return "version" in definition
    ? (
        await services.authorizationService.validateComposition({
          ...currentActor,
          requestId: requestIdValue,
          definition,
        })
      ).definition
    : (
        await services.authorizationService.validateDefinition({
          ...currentActor,
          requestId: requestIdValue,
          definition,
        })
      ).definition;
}

async function validateVersion(
  services: ReportsWorkerServices,
  currentActor: { userId: string; organizationId: string },
  requestIdValue: string,
  modelVersionId: string,
) {
  const version = await services.jobService.getVersion({
    organizationId: currentActor.organizationId,
    modelVersionId,
  });
  const definition = version.version.definition_json as ReportModelDefinition;
  if (version.model.created_by_user_id === currentActor.userId) {
    await validateModelDefinition(services, currentActor, definition, requestIdValue);
    return version;
  }
  const shared = await services.authorizationService.validateSharedDefinition({
    ...currentActor,
    requestId: requestIdValue,
    definition,
  });
  if (version.model.department_id !== shared.department_id) {
    throw new ServiceError(403, "O modelo compartilhado não pertence ao departamento atual.");
  }
  return version;
}

export function createReportsWorkerApp(options: ReportsWorkerOptions = {}) {
  const app = new Hono<ReportsWorkerContext>();
  const organizationAuth = requireOrganizationAuth(options);

  app.get("/health", (c) =>
    c.json(
      createSuccessResponse({
        status: "ok",
        service: "reports-service",
        env: (options.env ?? c.env).NODE_ENV ?? "production",
      }),
    ),
  );
  app.get("/ready", async (c) => {
    await checkReportsDatabase(options.env ?? c.env, options.prisma);
    return c.json(createSuccessResponse({ status: "ready", service: "reports-service" }));
  });

  app.use("/reports", organizationAuth);
  app.use("/reports/*", organizationAuth);

  app.get("/reports/catalog", async (c) =>
    withPureServices(c, options, async (services) => {
      const scope = await reportingCatalogScope(services, c, "reports-catalog");
      return c.json(
        createSuccessResponse({
          items: services.sourceCatalog.getAuthorizedCatalog(scope).sources,
        }),
      );
    }),
  );

  app.post("/reports/definitions/validate", async (c) =>
    withPureServices(c, options, async (services) => {
      const body = parseWithZod(validateReportDefinitionBodySchema, await jsonBody(c));
      const scope = await reportingCatalogScope(services, c, "reports-definition");
      if ("version" in body.definition)
        services.definitionService.validateComposition(body.definition, scope);
      else services.definitionService.validate(body.definition, scope);
      return c.json(createSuccessResponse({ definition: body.definition }));
    }),
  );

  app.post("/reports/preview", async (c) =>
    withPureServices(c, options, async (services) => {
      const body = parseWithZod(reportPreviewRequestSchema, await jsonBody(c));
      const scope = await reportingCatalogScope(services, c, "reports-preview");
      const result =
        "version" in body.definition
          ? await services.previewService.previewComposition(
              body.definition,
              scope,
              requestId(c, "reports-preview"),
            )
          : await services.previewService.preview(
              body.definition,
              scope,
              requestId(c, "reports-preview"),
              body.parameterValues,
            );
      return c.json(createSuccessResponse(result));
    }),
  );

  app.post("/reports/models/shared", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const body = parseWithZod(createReportModelSchema, await jsonBody(c));
      const authorized = await services.authorizationService.authorizeSharedModel({
        ...currentActor,
        requestId: requestId(c, "reports-shared-model-create"),
        definition: body.definition,
      });
      return c.json(
        createSuccessResponse(
          await services.modelService.createShared({
            organizationId: currentActor.organizationId,
            departmentId: authorized.department_id,
            name: body.name,
            description: body.description,
            definition: authorized.definition,
          }),
        ),
        201,
      );
    }),
  );

  app.get("/reports/models/shared/list", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const department = await services.authorizationService.getSharedDepartment({
        ...currentActor,
        requestId: requestId(c, "reports-shared-model-list"),
      });
      return c.json(
        createSuccessResponse({
          items: await services.modelService.listShared({
            organizationId: currentActor.organizationId,
            departmentId: department.id,
          }),
        }),
      );
    }),
  );

  app.post("/reports/models/shared/:id/copy", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const department = await services.authorizationService.getSharedDepartment({
        ...currentActor,
        requestId: requestId(c, "reports-shared-model-copy"),
      });
      const shared = await services.modelService.getShared({
        id,
        organizationId: currentActor.organizationId,
        departmentId: department.id,
      });
      const authorized = await services.authorizationService.validateSharedDefinition({
        ...currentActor,
        requestId: requestId(c, "reports-shared-model-copy"),
        definition: shared.definition,
      });
      return c.json(
        createSuccessResponse(
          await services.modelService.create({
            ...currentActor,
            name: shared.name,
            description: shared.description,
            definition: authorized.definition,
          }),
        ),
        201,
      );
    }),
  );

  app.post("/reports/models/shared/:id/preview", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const requestIdValue = requestId(c, "reports-shared-model-preview");
      const execution = await services.authorizationService.getSharedExecutionContext({
        ...currentActor,
        requestId: requestIdValue,
      });
      const shared = await services.modelService.getShared({
        id,
        organizationId: currentActor.organizationId,
        departmentId: execution.department.id,
      });
      const authorized = await services.authorizationService.validateSharedDefinition({
        ...currentActor,
        requestId: requestIdValue,
        definition: shared.definition,
      });
      const result =
        "version" in authorized.definition
          ? await services.previewService.previewComposition(
              authorized.definition,
              { ...execution.scope, grant: authorized.grant },
              requestIdValue,
            )
          : await services.previewService.preview(
              authorized.definition,
              { ...execution.scope, grant: authorized.grant },
              requestIdValue,
            );
      return c.json(createSuccessResponse(result));
    }),
  );

  app.get("/reports/models/shared/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const requestIdValue = requestId(c, "reports-shared-model-get");
      const execution = await services.authorizationService.getSharedExecutionContext({
        ...currentActor,
        requestId: requestIdValue,
      });
      const shared = await services.modelService.getShared({
        id,
        organizationId: currentActor.organizationId,
        departmentId: execution.department.id,
      });
      const authorized = await services.authorizationService.validateSharedDefinition({
        ...currentActor,
        requestId: requestIdValue,
        definition: shared.definition,
      });
      return c.json(
        createSuccessResponse({
          ...shared,
          definition: authorized.definition,
          grant: authorized.grant,
        }),
      );
    }),
  );

  app.patch("/reports/models/shared/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const body = parseWithZod(updateReportModelSchema, await jsonBody(c));
      if (!body.definition)
        throw new ServiceError(
          400,
          "A definição é obrigatória para atualizar o modelo compartilhado.",
        );
      const authorized = await services.authorizationService.authorizeSharedModel({
        ...currentActor,
        requestId: requestId(c, "reports-shared-model-update"),
        definition: body.definition,
      });
      return c.json(
        createSuccessResponse(
          await services.modelService.updateShared({
            id,
            organizationId: currentActor.organizationId,
            departmentId: authorized.department_id,
            name: body.name,
            description: body.description,
            definition: authorized.definition,
          }),
        ),
      );
    }),
  );

  app.post("/reports/models", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const body = parseWithZod(createReportModelSchema, await jsonBody(c));
      const definition = await validateModelDefinition(
        services,
        currentActor,
        body.definition,
        requestId(c, "reports-model-create"),
      );
      return c.json(
        createSuccessResponse(
          await services.modelService.create({
            ...currentActor,
            name: body.name,
            description: body.description,
            definition,
          }),
        ),
        201,
      );
    }),
  );

  app.get("/reports/models/list", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const models = await services.modelService.list(currentActor);
      const items = await Promise.all(
        models.map(async (model) => {
          try {
            await validateModelDefinition(
              services,
              currentActor,
              model.definition,
              requestId(c, "reports-model-list"),
            );
            return model;
          } catch (error) {
            if (error instanceof ServiceError && error.statusCode === 403) return null;
            throw error;
          }
        }),
      );
      return c.json(createSuccessResponse({ items: items.filter((model) => model !== null) }));
    }),
  );

  app.get("/reports/models/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const model = await services.modelService.get({ ...currentActor, id });
      const definition = await validateModelDefinition(
        services,
        currentActor,
        model.definition,
        requestId(c, "reports-model-get"),
      );
      return c.json(createSuccessResponse({ ...model, definition }));
    }),
  );

  app.patch("/reports/models/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      const body = parseWithZod(updateReportModelSchema, await jsonBody(c));
      const existing = await services.modelService.get({ ...currentActor, id });
      const definition = await validateModelDefinition(
        services,
        currentActor,
        body.definition ?? existing.definition,
        requestId(c, "reports-model-update"),
      );
      return c.json(
        createSuccessResponse(
          await services.modelService.update({
            ...currentActor,
            id,
            name: body.name,
            description: body.description,
            definition,
          }),
        ),
      );
    }),
  );

  app.delete("/reports/models/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const { id } = parseWithZod(reportModelIdParamsSchema, c.req.param());
      await services.modelService.delete({ ...actor(c), id });
      return new Response(null, { status: 204 });
    }),
  );

  app.post("/reports/jobs", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const body = parseWithZod(createReportJobSchema, await jsonBody(c));
      const requestIdValue = requestId(c, "reports-job-create");
      const rawIdempotencyKey = c.req.header("Idempotency-Key");
      const idempotencyKey =
        rawIdempotencyKey === undefined
          ? undefined
          : parseWithZod(reportJobIdempotencyKeySchema, rawIdempotencyKey);
      const payload = { format: body.format, parameterValues: body.parameterValues ?? {} };
      const idempotencyHash = idempotencyKey
        ? createReportJobIdempotencyHash({
            definition: body.definition,
            modelVersionId: body.modelVersionId,
            parameterValues: body.parameterValues ?? {},
            format: body.format,
          })
        : undefined;
      const job = body.definition
        ? await services.jobService.createFromDefinition({
            ...currentActor,
            definition: await validateModelDefinition(
              services,
              currentActor,
              body.definition,
              requestIdValue,
            ),
            payload,
            ...(idempotencyKey ? { idempotencyKey, idempotencyHash } : {}),
          })
        : await (async () => {
            const version = await validateVersion(
              services,
              currentActor,
              requestIdValue,
              body.modelVersionId ?? "",
            );
            const retentionDays = await services.jobService.getRetentionDays({
              organizationId: currentActor.organizationId,
              modelId: version.model.id,
            });
            return services.jobService.create({
              ...currentActor,
              modelVersionId: version.version.id,
              payload: { ...payload, retentionDays },
              ...(idempotencyKey ? { idempotencyKey, idempotencyHash } : {}),
            });
          })();
      return c.json(createSuccessResponse(job), 201);
    }),
  );

  app.get("/reports/jobs/list", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const query = parseWithZod(reportJobListQuerySchema, c.req.query());
      const access =
        query.scope === "library" ? await reportingAccess(services, c, "reports-job-list") : null;
      if (query.scope === "library" && !access?.department)
        throw new ServiceError(403, "O acervo compartilhado exige membro de departamento.");
      const history = await services.jobService.listHistory({
        ...currentActor,
        scope: query.scope,
        ...(access?.department ? { departmentId: access.department.id } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.model_id ? { modelId: query.model_id } : {}),
        ...(query.author_id ? { authorId: query.author_id } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        limit: query.limit,
      });
      if (query.scope !== "library") return c.json(createSuccessResponse(history));
      const items = (
        await Promise.all(
          history.items.map(async (item) => {
            try {
              await validateVersion(
                services,
                currentActor,
                requestId(c, "reports-job-list"),
                item.report_model_version_id,
              );
              return item;
            } catch {
              return null;
            }
          }),
        )
      ).filter((item): item is NonNullable<typeof item> => item !== null);
      return c.json(createSuccessResponse({ ...history, items }));
    }),
  );

  app.get("/reports/jobs/:id", async (c) =>
    withReportsServices(c, options, async (services) => {
      const { id } = parseWithZod(reportJobIdParamsSchema, c.req.param());
      return c.json(createSuccessResponse(await services.jobService.get({ ...actor(c), id })));
    }),
  );

  app.post("/reports/snapshots/:id/delete", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const access = await reportingAccess(services, c, "reports-snapshot-delete");
      const module = access.departmentModule;
      if (
        access.type !== "admin" ||
        !access.department ||
        !module ||
        (access.modules[module] ?? 0) < 3
      )
        throw new ServiceError(403, "A exclusão exige Admin 3 do departamento do job.");
      const { id } = parseWithZod(reportJobIdParamsSchema, c.req.param());
      const { justification } = parseWithZod(deleteReportJobSchema, await jsonBody(c));
      await services.lifecycleService.deleteSnapshot({
        snapshot_id: id,
        organization_id: currentActor.organizationId,
        actor_id: currentActor.userId,
        department_id: access.department.id,
        reason: "requested",
        justification,
      });
      return new Response(null, { status: 204 });
    }),
  );

  app.post("/reports/jobs/:id/cancel", async (c) =>
    withReportsServices(c, options, async (services) => {
      const { id } = parseWithZod(reportJobIdParamsSchema, c.req.param());
      await services.jobService.cancel({ ...actor(c), id });
      return new Response(null, { status: 204 });
    }),
  );

  app.get("/reports/jobs/:id/snapshot", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const { id } = parseWithZod(reportJobIdParamsSchema, c.req.param());
      const query = parseWithZod(snapshotQuerySchema, c.req.query());
      const access =
        query.scope === "library"
          ? await reportingAccess(services, c, "reports-job-snapshot")
          : null;
      if (query.scope === "library" && !access?.department)
        throw new ServiceError(403, "O acervo compartilhado exige membro de departamento.");
      if (query.scope === "library") {
        const job = await services.jobService.getVersionId({
          organizationId: currentActor.organizationId,
          id,
        });
        await validateVersion(
          services,
          currentActor,
          requestId(c, "reports-job-snapshot"),
          job.report_model_version_id,
        );
      }
      return c.json(
        createSuccessResponse(
          await services.snapshotService.get({
            ...currentActor,
            jobId: id,
            scope: query.scope,
            ...(access?.department ? { departmentId: access.department.id } : {}),
            ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
            limit: query.limit,
          }),
        ),
      );
    }),
  );

  app.get("/reports/snapshots/:id/export", async (c) =>
    withReportsServices(c, options, async (services) => {
      const { id } = parseWithZod(reportJobIdParamsSchema, c.req.param());
      const { format } = parseWithZod(exportQuerySchema, c.req.query());
      const result = await services.exportService.export({
        snapshotId: id,
        ...actor(c),
        requestId: requestId(c, "reports-export"),
        format,
      });
      return new Response(result.body as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${result.fileName}"`,
          "Cache-Control": "no-store",
        },
      });
    }),
  );

  app.get("/reports/retention", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const access = await reportingAccess(services, c, "reports-retention");
      if (access.type !== "owner")
        throw new ServiceError(403, "Somente o owner pode alterar a retenção dos relatórios.");
      return c.json(
        createSuccessResponse(await services.retentionService.getOrganizationPolicy(currentActor)),
      );
    }),
  );

  app.put("/reports/retention", async (c) =>
    withReportsServices(c, options, async (services) => {
      const currentActor = actor(c);
      const access = await reportingAccess(services, c, "reports-retention");
      if (access.type !== "owner")
        throw new ServiceError(403, "Somente o owner pode alterar a retenção dos relatórios.");
      const body = parseWithZod(
        reportRetentionPolicySchema.omit({ organization_id: true }),
        await jsonBody(c),
      );
      return c.json(
        createSuccessResponse(
          await services.retentionService.updateOrganizationPolicy({
            organizationId: currentActor.organizationId,
            retentionDays: body.retention_days,
            actorId: currentActor.userId,
          }),
        ),
      );
    }),
  );

  app.onError((error, c) => jsonError(error, c.req.header(REQUEST_ID_HEADER)));
  app.notFound((c) =>
    jsonError(new ServiceError(404, "Recurso não encontrado."), requestId(c, "reports-not-found")),
  );

  const request = app.request.bind(app);
  app.request = ((input: RequestInfo | URL, init?: RequestInit, requestEnv?: unknown) =>
    request(input, init, requestEnv ?? options.env)) as typeof app.request;
  return app;
}
