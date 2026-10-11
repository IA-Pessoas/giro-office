import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import {
  type ContabilTriagePortfolioFilterable,
  type FiscalTriagePortfolioFilterable,
  filterContabilTriagePortfolio,
  filterFiscalTriagePortfolio,
  fiscalTriagePortfolioFiltersFromQuery,
} from "@workspace/shared/triagem";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { buildContabilServiceOpenApiSpec } from "../../../services/contabil-service/src/openapi/spec.js";
import {
  contingencyIdParamsSchema,
  contingencyQuerySchema,
  contingencyReviewSchema,
} from "../../../services/contabil-service/src/schemas/contingency.schemas.js";
import {
  controlCompetenceBodySchema,
  controlHistoryQuerySchema,
  controlIdParamsSchema,
  createControlBodySchema,
  createYearControlsBodySchema,
  detailControlQuerySchema,
  updateControlFieldBodySchema,
} from "../../../services/contabil-service/src/schemas/control.schemas.js";
import {
  noahIdParamsSchema,
  noahUploadQuerySchema,
} from "../../../services/contabil-service/src/schemas/noah.schemas.js";
import {
  createRelationshipBodySchema,
  relationshipClientIdParamsSchema,
  relationshipHistoryQuerySchema,
  relationshipIdParamsSchema,
  updateRelationshipBodySchema,
} from "../../../services/contabil-service/src/schemas/relationship.schemas.js";
import {
  createResponsibleBodySchema,
  responsibleClientIdParamsSchema,
  responsibleIdParamsSchema,
  updateResponsibleBodySchema,
} from "../../../services/contabil-service/src/schemas/responsible.schemas.js";
import { CONTINGENCY_LIMITS } from "../../../services/contabil-service/src/services/contingencyCalculationService.js";
import { ContingencyService } from "../../../services/contabil-service/src/services/contingencyService.js";
import {
  type ControlHistoryPrisma,
  listControlHistory,
} from "../../../services/contabil-service/src/services/controlHistoryService.js";
import { NOAH_LIMITS } from "../../../services/contabil-service/src/services/noahConversionService.js";
import { NoahService } from "../../../services/contabil-service/src/services/noahService.js";
import {
  listRelationshipHistory,
  type RelationshipHistoryPrisma,
} from "../../../services/contabil-service/src/services/relationshipHistoryService.js";
import {
  listTriageDocumentHistory,
  type TriageDocumentHistoryPrisma,
} from "../../../services/contabil-service/src/services/triageDocumentHistoryService.js";
import { createContabilAudit } from "./audit.js";
import {
  authenticateContabilRequest,
  contabilPermission,
  requireContabilModule,
  requireContabilWrite,
  requireTriagemAdmin,
  requireTriagemModule,
} from "./auth.js";
import type { ContabilWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";
import {
  contabilReportingCatalog,
  internalReportingExtractBodySchema,
  reportingQueryFields,
  verifyReportingGrant,
} from "./reporting.js";
import {
  closingQuerySchema,
  closingUpdateSchema,
  cloudCreateSchema,
  cloudIdSchema,
  cloudListSchema,
  cloudUpdateSchema,
  contabilPortfolioSchema,
  documentItemSchema,
  documentsBulkSchema,
  editabilitySchema,
  fiscalPortfolioSchema,
  fiscalSettingsBodySchema,
  fiscalSettingsQuerySchema,
  monthlyIdSchema,
  monthlySchema,
  monthlyUpdateSchema,
  statementArchiveSchema,
  statementHistorySchema,
  statementSchema,
  triageConfigBodySchema,
  triageConfigQuerySchema,
  triageDocumentHistorySchema,
} from "./schemas.js";
import {
  type AuthContext,
  type ClosingService,
  type ContabilPrisma,
  type ControlService,
  createClosingService,
  createControlService,
  createDocumentsService,
  createRelationshipService,
  createReportingService,
  createResponsibleService,
  type DocumentsService,
  type RelationshipService,
  type ReportingService,
  type ResponsibleService,
} from "./services.js";
import { createTriagemOverviewClient } from "./triagem.js";

export type { ContabilWorkerEnv } from "./env.js";
export type { ContabilPrisma } from "./services.js";

type ContabilOptions = {
  env?: ContabilWorkerEnv;
  prisma?: ContabilPrisma;
  controlService?: ControlService;
  contingencyService?: Pick<ContingencyService, "simulate" | "review" | "export">;
  relationshipService?: RelationshipService;
  responsibleService?: ResponsibleService;
  triageClosingService?: ClosingService;
  triageDocumentsService?: DocumentsService;
  reportingService?: ReportingService;
  noahService?: Pick<NoahService, "create" | "download">;
};
type ContabilContext = { Bindings: ContabilWorkerEnv; Variables: { auth: WorkerAuthContext } };
type Context = {
  env: ContabilWorkerEnv;
  req: {
    raw: Request;
    url: string;
    query(): Record<string, string>;
    param(name: string): string | undefined;
    json<T>(): Promise<T>;
    header(name: string): string | undefined;
  };
  get(name: "auth"): WorkerAuthContext;
};

function authContext(auth: WorkerAuthContext): AuthContext {
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    permission: auth.claims.permission,
    modules: auth.claims.modules as Record<string, number>,
  };
}

function contabilAuthContext(auth: WorkerAuthContext): AuthContext {
  return { ...authContext(auth), permission: contabilPermission(auth) };
}

async function readJson(c: { req: { json<T>(): Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}

function withPrisma<T>(
  c: { env: ContabilWorkerEnv },
  options: ContabilOptions,
  callback: (prisma: ContabilPrisma) => Promise<T>,
): Promise<T> {
  if (options.prisma) return callback(options.prisma);
  const env = options.env ?? c.env;
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new ServiceError(
      503,
      "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
    );
  }
  return withWorkerPrisma(env, PrismaClient, (client) =>
    callback(client as unknown as ContabilPrisma),
  );
}

/** Aplica um filtro da carteira sobre `items` da resposta, mantendo o resto (competência). */
function filterItems<T>(data: Record<string, unknown>, filter: (items: T[]) => T[]) {
  return { ...data, items: filter(Array.isArray(data.items) ? (data.items as T[]) : []) };
}

function executeAuthWrite(c: Context): void {
  requireContabilWrite(c.get("auth"));
}

// Equivalente ao `mountOpenApiDocs` do Node (swagger-ui-express): mesma versão do
// swagger-ui-dist do lockfile, servida por CDN com SRI porque o Worker não empacota os assets.
// ponytail: HTML duplicado nos Workers contabil/fiscal/triagem/parcelamento; mover para
// @workspace/runtime quando outro Worker também servir /docs.
const SWAGGER_UI_CDN = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.2";

function swaggerUiHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="${SWAGGER_UI_CDN}/swagger-ui.css" integrity="sha384-F7uqyyVZgBbuOv+8gNy6ZGJB8Rf12CczPWm130Pxrau0cyZlj1Dl18cDOWpQSrGh" crossorigin="anonymous">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI_CDN}/swagger-ui-bundle.js" integrity="sha384-phexB4pLDnmX1PhMxW3Ojwp92jIrirblcgNHltMum/KEQzYuBelzyulhx5ALflmy" crossorigin="anonymous"></script>
  <script>window.ui = SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>
</body>
</html>`;
}

// Mesmo gate do fiscal Worker: opt-in explícito e nunca em produção. O Node liga por padrão
// fora de produção, mas o Worker não recebe NODE_ENV por padrão e exporia a spec em produção.
function apiDocsEnabled(env: ContabilWorkerEnv): boolean {
  return (
    (env.ENABLE_API_DOCS === "true" || env.ENABLE_API_DOCS === "1") && env.NODE_ENV !== "production"
  );
}

// Rotas que só o Worker serve entram aqui, por cima da spec do serviço Node: cada operação de
// `openapi/spec.ts` é exigida no manifesto de smoke, que roda contra o serviço Node, onde
// estas rotas não existem.
const WORKER_ONLY_OPENAPI_PATHS = {
  "/triagem/documents/history": {
    get: {
      tags: ["Triage Documents"],
      summary: "Listar histórico documental da Triagem",
      description:
        "Lido da auditoria, do mais recente para o mais antigo. Exige `contabil` ou `triagem` >= 1. Sem `client_id` lista a organização inteira e exige `contabil` ou `triagem` >= 3. Com `competence`, ficam de fora Cloud e configuração, que são do cliente. Evento sem campo exibível vem com `changes` vazio.",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "client_id",
          in: "query",
          required: false,
          schema: { type: "string", format: "uuid" },
        },
        {
          name: "competence",
          in: "query",
          required: false,
          schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
        },
        {
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
        },
        {
          name: "pageSize",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        "200": {
          description:
            "Página do histórico: `client_id`, `competence`, `page`, `pageSize`, `total` e `items` (ator, instante, ação, objeto e alterações campo a campo)",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
          },
        },
        "400": { description: "Parâmetros inválidos" },
        "401": { description: "Não autenticado" },
        "403": { description: "Sem permissão, ou sem `client_id` por quem não é administrador" },
        "404": { description: "Cliente não encontrado" },
      },
    },
  },
};

function workerOpenApiSpec() {
  const spec = buildContabilServiceOpenApiSpec({ port: 8787 } as Parameters<
    typeof buildContabilServiceOpenApiSpec
  >[0]);
  return { ...spec, paths: { ...spec.paths, ...WORKER_ONLY_OPENAPI_PATHS } };
}

export function createContabilWorkerApp(options: ContabilOptions = {}) {
  const app = new Hono<ContabilContext>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "contabil-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else {
      await withPrisma(c, options, async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
      });
    }
    return c.json(createSuccessResponse({ status: "ready", service: "contabil-service" }));
  });

  app.get("/openapi.json", (c) =>
    apiDocsEnabled(options.env ?? c.env) ? c.json(workerOpenApiSpec()) : c.notFound(),
  );
  app.get("/docs", (c) =>
    apiDocsEnabled(options.env ?? c.env)
      ? c.html(swaggerUiHtml("contabil-service — OpenAPI"))
      : c.notFound(),
  );

  app.use("/contabil/*", async (c, next) => {
    const auth = await authenticateContabilRequest(c.req.raw, options.env ?? c.env);
    requireContabilModule(auth);
    c.set("auth", auth);
    await next();
  });
  app.use("/contabil", async (c, next) => {
    const auth = await authenticateContabilRequest(c.req.raw, options.env ?? c.env);
    requireContabilModule(auth);
    c.set("auth", auth);
    await next();
  });
  app.use("/triagem/*", async (c, next) => {
    const auth = await authenticateContabilRequest(c.req.raw, options.env ?? c.env);
    requireTriagemModule(auth);
    c.set("auth", auth);
    await next();
  });
  app.use("/triagem", async (c, next) => {
    const auth = await authenticateContabilRequest(c.req.raw, options.env ?? c.env);
    requireTriagemModule(auth);
    c.set("auth", auth);
    await next();
  });

  app.post(
    "/contabil/noah",
    (c, next) => {
      executeAuthWrite(c);
      return next();
    },
    bodyLimit({
      maxSize: NOAH_LIMITS.zipBytes,
      onError: () => {
        throw new ServiceError(413, "O ZIP excede 5 MiB.");
      },
    }),
    async (c) => {
      if (c.req.header("content-type")?.split(";")[0] !== "application/zip") {
        throw new ServiceError(415, "Envie um arquivo ZIP.");
      }
      const { filename } = parseWithZod(noahUploadQuerySchema, c.req.query());
      const bytes = Buffer.from(await c.req.arrayBuffer());
      const auth = contabilAuthContext(c.get("auth"));
      const invoke = (service: Pick<NoahService, "create">) =>
        service.create(bytes, filename, auth);
      const data = options.noahService
        ? await invoke(options.noahService)
        : await withPrisma(c, options, (prisma) => invoke(new NoahService(prisma)));
      c.header("Cache-Control", "no-store");
      return c.json(createSuccessResponse(data), 201);
    },
  );

  app.get("/contabil/noah/:id/csv", async (c) => {
    const { id } = parseWithZod(noahIdParamsSchema, { id: c.req.param("id") });
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: Pick<NoahService, "download">) => service.download(id, auth);
    const csv = options.noahService
      ? await invoke(options.noahService)
      : await withPrisma(c, options, (prisma) => invoke(new NoahService(prisma)));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="NOAH-${id}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.post(
    "/contabil/contingency",
    async (c, next) => {
      requireContabilWrite(c.get("auth"));
      if (c.req.header("content-type")?.split(";")[0].trim() !== "application/vnd.ms-excel") {
        throw new ServiceError(415, "Envie um arquivo XLS.");
      }
      return next();
    },
    bodyLimit({
      maxSize: CONTINGENCY_LIMITS.bytes,
      onError: () => {
        throw new ServiceError(413, "O XLS excede 5 MiB.");
      },
    }),
    async (c) => {
      const input = parseWithZod(contingencyQuerySchema, c.req.query());
      const bytes = Buffer.from(await c.req.arrayBuffer());
      const invoke = (service: Pick<ContingencyService, "simulate">) =>
        service.simulate(bytes, input, contabilAuthContext(c.get("auth")));
      const result = options.contingencyService
        ? await invoke(options.contingencyService)
        : await withPrisma(c, options, (prisma) => invoke(new ContingencyService(prisma)));
      c.header("Cache-Control", "no-store");
      return c.json(createSuccessResponse(result));
    },
  );

  app.post("/contabil/contingency/:id/review", async (c) => {
    requireContabilWrite(c.get("auth"));
    const { id } = parseWithZod(contingencyIdParamsSchema, { id: c.req.param("id") });
    const { content_hash } = parseWithZod(contingencyReviewSchema, await readJson(c));
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: Pick<ContingencyService, "review">) =>
      service.review(id, content_hash, auth);
    const result = options.contingencyService
      ? await invoke(options.contingencyService)
      : await withPrisma(c, options, (prisma) => invoke(new ContingencyService(prisma)));
    c.header("Cache-Control", "no-store");
    return c.json(createSuccessResponse(result));
  });

  app.get("/contabil/contingency/:id/export", async (c) => {
    requireContabilWrite(c.get("auth"));
    const { id } = parseWithZod(contingencyIdParamsSchema, { id: c.req.param("id") });
    const { content_hash } = parseWithZod(contingencyReviewSchema, c.req.query());
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: Pick<ContingencyService, "export">) =>
      service.export(id, content_hash, auth);
    const html = options.contingencyService
      ? await invoke(options.contingencyService)
      : await withPrisma(c, options, (prisma) => invoke(new ContingencyService(prisma)));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="contingencia-${id}.html"`,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.get("/contabil/controls/list", async (c) => {
    const query = parseWithZod(contabilPortfolioSchema, c.req.query());
    const auth = c.get("auth");
    const invoke = (service: ControlService) => service.list(query.competence, auth.organizationId);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, async (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(
      createSuccessResponse(
        filterItems<ContabilTriagePortfolioFilterable>(data, (items) =>
          filterContabilTriagePortfolio(items, {
            responsibleId: query.responsible_id,
            regime: query.regime,
            closingStatus: query.status,
          }),
        ),
      ),
    );
  });

  app.post("/contabil/controls/year", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(createYearControlsBodySchema, await readJson(c));
    const auth = c.get("auth");
    const input = {
      clientId: body.client_id,
      year: body.year,
      confirmed: body.confirmed,
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: contabilPermission(auth),
      modules: auth.claims.modules,
    };
    const invoke = (service: ControlService) => service.createYear(input);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.delete("/contabil/controls", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(controlCompetenceBodySchema, await readJson(c));
    const auth = c.get("auth");
    const input = {
      clientId: body.client_id,
      competence: body.competence,
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: contabilPermission(auth),
      modules: auth.claims.modules,
    };
    const invoke = (service: ControlService) => service.archiveCompetence(input);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.post("/contabil/controls/restore", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(controlCompetenceBodySchema, await readJson(c));
    const auth = c.get("auth");
    const input = {
      clientId: body.client_id,
      competence: body.competence,
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: contabilPermission(auth),
      modules: auth.claims.modules,
    };
    const invoke = (service: ControlService) => service.restoreCompetence(input);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.post("/contabil/controls", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(createControlBodySchema, await readJson(c));
    const auth = c.get("auth");
    const input = {
      clientId: body.client_id,
      competence: body.competence,
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: contabilPermission(auth),
      modules: auth.claims.modules,
    };
    const invoke = (service: ControlService) => service.create(input);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data.control), data.created ? 201 : 200);
  });

  app.get("/contabil/controls", async (c) => {
    const query = parseWithZod(detailControlQuerySchema, c.req.query());
    const auth = c.get("auth");
    const invoke = (service: ControlService) =>
      service.detail(query.client_id, query.competence, auth.organizationId);
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.get("/contabil/controls/history", async (c) => {
    const query = parseWithZod(controlHistoryQuerySchema, c.req.query());
    const auth = c.get("auth");
    const data = await withPrisma(c, options, (prisma) =>
      listControlHistory(prisma as unknown as ControlHistoryPrisma, {
        organizationId: auth.organizationId,
        clientId: query.client_id,
        competence: query.competence,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.patch("/contabil/controls/:id/items", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(controlIdParamsSchema, { id: c.req.param("id") });
    const auth = c.get("auth");
    const invoke = (service: ControlService) =>
      service.completeAll(params.id, contabilAuthContext(auth));
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.patch("/contabil/controls/:id", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(controlIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateControlFieldBodySchema, await readJson(c));
    const auth = c.get("auth");
    const invoke = (service: ControlService) =>
      service.updateField(params.id, body.field, body.value, contabilAuthContext(auth));
    const data = options.controlService
      ? await invoke(options.controlService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createControlService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.post("/contabil/relationships", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(createRelationshipBodySchema, await readJson(c));
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: RelationshipService) => service.create(body, auth);
    const data = options.relationshipService
      ? await invoke(options.relationshipService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createRelationshipService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data), 201);
  });
  app.put("/contabil/relationships/:id", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(relationshipIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateRelationshipBodySchema, await readJson(c));
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: RelationshipService) => service.update(params.id, body, auth);
    const data = options.relationshipService
      ? await invoke(options.relationshipService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createRelationshipService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.get("/contabil/relationships/client/:clientId/history", async (c) => {
    const params = parseWithZod(relationshipClientIdParamsSchema, {
      clientId: c.req.param("clientId"),
    });
    const query = parseWithZod(relationshipHistoryQuerySchema, c.req.query());
    const auth = c.get("auth");
    const data = await withPrisma(c, options, (prisma) =>
      listRelationshipHistory(prisma as unknown as RelationshipHistoryPrisma, {
        organizationId: auth.organizationId,
        clientId: params.clientId,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/contabil/relationships/client/:clientId", async (c) => {
    const params = parseWithZod(relationshipClientIdParamsSchema, {
      clientId: c.req.param("clientId"),
    });
    const auth = c.get("auth");
    const invoke = (service: RelationshipService) =>
      service.getByClientId(params.clientId, auth.organizationId);
    const data = options.relationshipService
      ? await invoke(options.relationshipService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createRelationshipService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.delete("/contabil/relationships/:id", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(relationshipIdParamsSchema, { id: c.req.param("id") });
    const auth = c.get("auth");
    const invoke = (service: RelationshipService) => service.delete(params.id, auth.organizationId);
    const data = options.relationshipService
      ? await invoke(options.relationshipService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createRelationshipService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.post("/contabil/responsibles", async (c) => {
    executeAuthWrite(c);
    const body = parseWithZod(createResponsibleBodySchema, await readJson(c));
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: ResponsibleService) => service.create(body, auth);
    const data = options.responsibleService
      ? await invoke(options.responsibleService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createResponsibleService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data), 201);
  });
  app.put("/contabil/responsibles/:id", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(responsibleIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateResponsibleBodySchema, await readJson(c));
    const auth = contabilAuthContext(c.get("auth"));
    const invoke = (service: ResponsibleService) => service.update(params.id, body, auth);
    const data = options.responsibleService
      ? await invoke(options.responsibleService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createResponsibleService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.get("/contabil/responsibles/client/:clientId", async (c) => {
    const params = parseWithZod(responsibleClientIdParamsSchema, {
      clientId: c.req.param("clientId"),
    });
    const auth = c.get("auth");
    const invoke = (service: ResponsibleService) =>
      service.getByClientId(params.clientId, auth.organizationId);
    const data = options.responsibleService
      ? await invoke(options.responsibleService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createResponsibleService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.delete("/contabil/responsibles/:id", async (c) => {
    executeAuthWrite(c);
    const params = parseWithZod(responsibleIdParamsSchema, { id: c.req.param("id") });
    const auth = c.get("auth");
    const invoke = (service: ResponsibleService) => service.delete(params.id, auth.organizationId);
    const data = options.responsibleService
      ? await invoke(options.responsibleService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createResponsibleService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  app.get("/triagem/closing", async (c) => {
    const query = parseWithZod(closingQuerySchema, c.req.query());
    const auth = c.get("auth");
    const invoke = (service: ClosingService) => service.get(query, auth.organizationId);
    const data = options.triageClosingService
      ? await invoke(options.triageClosingService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createClosingService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.put("/triagem/closing", async (c) => {
    const body = parseWithZod(closingUpdateSchema, await readJson(c));
    const auth = authContext(c.get("auth"));
    const invoke = (service: ClosingService) => service.update(body, auth);
    const data = options.triageClosingService
      ? await invoke(options.triageClosingService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createClosingService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });
  app.delete("/triagem/closing", async (c) => {
    const body = parseWithZod(closingQuerySchema, await readJson(c));
    const auth = authContext(c.get("auth"));
    const invoke = (service: ClosingService) => service.archive(body, auth);
    const data = options.triageClosingService
      ? await invoke(options.triageClosingService)
      : await withPrisma(c, options, (prisma) =>
          invoke(createClosingService(prisma, createContabilAudit(options.env ?? c.env))),
        );
    return c.json(createSuccessResponse(data));
  });

  const withDocuments = <T>(
    c: Context,
    callback: (service: DocumentsService) => Promise<T>,
  ): Promise<T> => {
    if (options.triageDocumentsService) return callback(options.triageDocumentsService);
    return withPrisma(c, options, (prisma) =>
      callback(
        createDocumentsService(
          prisma,
          createContabilAudit(options.env ?? c.env),
          createTriagemOverviewClient(options.env ?? c.env, c.req.url),
        ),
      ),
    );
  };
  app.get("/triagem/fiscal-portfolio", async (c) => {
    const query = parseWithZod(fiscalPortfolioSchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.listFiscalPortfolio(query.competence, authContext(c.get("auth"))),
    );
    return c.json(
      createSuccessResponse(
        filterItems<FiscalTriagePortfolioFilterable>(data, (items) =>
          filterFiscalTriagePortfolio(items, fiscalTriagePortfolioFiltersFromQuery(query)),
        ),
      ),
    );
  });
  app.get("/triagem/editability", async (c) => {
    const query = parseWithZod(editabilitySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.getEditability(query.client_id, authContext(c.get("auth")), query.type),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/monthly", async (c) => {
    const query = parseWithZod(monthlySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.getMonthly(query, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.post("/triagem/monthly", async (c) => {
    const body = parseWithZod(monthlySchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.getOrCreateMonthly(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.patch("/triagem/monthly/:id/item", async (c) => {
    const params = parseWithZod(monthlyIdSchema, { id: c.req.param("id") });
    const body = parseWithZod(documentItemSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.updateItem(params.id, body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.patch("/triagem/monthly/:id", async (c) => {
    const params = parseWithZod(monthlyIdSchema, { id: c.req.param("id") });
    const body = parseWithZod(monthlyUpdateSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.updateMonthly(params.id, body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/fiscal-settings", async (c) => {
    const query = parseWithZod(fiscalSettingsQuerySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.getFiscalSettings(query, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.put("/triagem/fiscal-settings", async (c) => {
    const body = parseWithZod(fiscalSettingsBodySchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.saveFiscalSettings(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/config", async (c) => {
    const query = parseWithZod(triageConfigQuerySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.getConfig(query, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.put("/triagem/config", async (c) => {
    const body = parseWithZod(triageConfigBodySchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.saveConfig(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.patch("/triagem/monthly/:id/items", async (c) => {
    const params = parseWithZod(monthlyIdSchema, { id: c.req.param("id") });
    const body = parseWithZod(documentsBulkSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.updateAll(params.id, body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/statements", async (c) => {
    const query = parseWithZod(monthlySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.listStatements(query, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/clouds", async (c) => {
    const query = parseWithZod(cloudListSchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.listClouds(query, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.post("/triagem/clouds", async (c) => {
    const body = parseWithZod(cloudCreateSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.createCloud(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data), 201);
  });
  app.patch("/triagem/clouds/:id", async (c) => {
    const params = parseWithZod(cloudIdSchema, { id: c.req.param("id") });
    const body = parseWithZod(cloudUpdateSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.updateCloud(params.id, body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/documents/history", async (c) => {
    const query = parseWithZod(triageDocumentHistorySchema, c.req.query());
    const auth = c.get("auth");
    // Sem cliente é a organização inteira: alterações recentes, só para administrador.
    if (!query.client_id) requireTriagemAdmin(auth);
    const data = await withPrisma(c, options, (prisma) =>
      listTriageDocumentHistory(prisma as unknown as TriageDocumentHistoryPrisma, {
        organizationId: auth.organizationId,
        ...(query.client_id ? { clientId: query.client_id } : {}),
        ...(query.competence ? { competence: query.competence } : {}),
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
    return c.json(createSuccessResponse(data));
  });
  app.get("/triagem/statements/history", async (c) => {
    const query = parseWithZod(statementHistorySchema, c.req.query());
    const data = await withDocuments(c, (service) =>
      service.listStatementHistory(query, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.put("/triagem/statements", async (c) => {
    const body = parseWithZod(statementSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.upsertStatement(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });
  app.delete("/triagem/statements", async (c) => {
    const body = parseWithZod(statementArchiveSchema, await readJson(c));
    const data = await withDocuments(c, (service) =>
      service.archiveStatement(body, authContext(c.get("auth"))),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant({
      env: options.env ?? c.env,
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "catalog",
      source: "contabil.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(contabilReportingCatalog));
  });
  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await readJson(c));
    const grant = await verifyReportingGrant({
      env: options.env ?? c.env,
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const invoke = (service: ReportingService) =>
      service.extract({
        organizationId: grant.organization_id,
        source: body.source,
        fields: body.fields,
        limit: body.limit,
        ...(body.query ? { query: body.query } : {}),
      });
    const data = options.reportingService
      ? await invoke(options.reportingService)
      : await withPrisma(c, options, (prisma) => invoke(createReportingService(prisma)));
    return c.json(createSuccessResponse(data));
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no contabil-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}
