import { buildParcelamentoServiceOpenApiSpec } from "@workspace/parcelamento-service/src/openapi/spec.js";
import type { ListInstallmentsQuery } from "@workspace/parcelamento-service/src/schemas/installment.schemas.js";
import {
  createInstallmentBodySchema,
  installmentIdParamsSchema,
  listInstallmentsQuerySchema,
  patchInstallmentBodySchema,
} from "@workspace/parcelamento-service/src/schemas/installment.schemas.js";
import {
  createInstallmentCompetencyBodySchema,
  installmentCompetencyIdParamsSchema,
  installmentCompetencyParentParamsSchema,
  listInstallmentCompetenciesQuerySchema,
  patchInstallmentCompetencyBodySchema,
} from "@workspace/parcelamento-service/src/schemas/installmentCompetency.schemas.js";
import {
  createPanoramaBodySchema,
  generatePanoramasBodySchema,
  listPanoramasQuerySchema,
  panoramaCompetenceParamsSchema,
  panoramaIdParamsSchema,
  patchPanoramaBodySchema,
} from "@workspace/parcelamento-service/src/schemas/panorama.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createParcelamentoAudit } from "./audit.js";
import { authenticateParcelamentoRequest } from "./auth.js";
import type { ParcelamentoWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";
import {
  internalReportingExtractBodySchema,
  parcelamentoReportingCatalog,
  reportingQueryFields,
  verifyReportingGrant,
} from "./reporting.js";
import {
  createInstallmentCompetencyService,
  createInstallmentService,
  createPanoramaService,
  createReportingService,
  type ParcelamentoPrisma,
  type ParcelamentoRequestContext,
} from "./services.js";

export type { ParcelamentoWorkerEnv } from "./env.js";
export type { ParcelamentoRequestContext } from "./services.js";

export interface InstallmentServiceLike {
  list(
    context: ParcelamentoRequestContext,
    query: ListInstallmentsQuery,
  ): Promise<Record<string, unknown>>;
  getById(context: ParcelamentoRequestContext, id: string): Promise<Record<string, unknown>>;
}

interface ParcelamentoWorkerOptions {
  env?: ParcelamentoWorkerEnv;
  prisma?: Pick<ParcelamentoPrisma, "$queryRaw"> | ParcelamentoPrisma;
  installmentService?: InstallmentServiceLike;
}

type Env = {
  Bindings: ParcelamentoWorkerEnv;
  Variables: { auth: WorkerAuthContext; requestId: string };
};
type ParcelamentoContext = Context<Env>;

function requestContext(c: ParcelamentoContext): ParcelamentoRequestContext {
  const auth = c.get("auth");
  return {
    requestId: c.get("requestId"),
    userId: auth.userId,
    organizationId: auth.organizationId,
    ...(auth.claims.permission === undefined ? {} : { permission: String(auth.claims.permission) }),
  };
}

function queryOf(c: ParcelamentoContext): Record<string, string | string[]> {
  const params = new URL(c.req.url).searchParams;
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }

  return query;
}

/** express.json() do Node: corpo ausente vira {}; JSON malformado vira 400. */
async function readJson(c: ParcelamentoContext): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
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
function apiDocsEnabled(env: ParcelamentoWorkerEnv): boolean {
  return (
    (env.ENABLE_API_DOCS === "true" || env.ENABLE_API_DOCS === "1") && env.NODE_ENV !== "production"
  );
}

export function createParcelamentoWorkerApp(options: ParcelamentoWorkerOptions = {}) {
  const app = new Hono<Env>();
  const envOf = (c: ParcelamentoContext) => options.env ?? c.env;

  const withPrisma = <T>(
    c: ParcelamentoContext,
    callback: (prisma: ParcelamentoPrisma) => Promise<T>,
  ): Promise<T> => {
    if (options.prisma) return callback(options.prisma as ParcelamentoPrisma);
    const env = envOf(c);
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new ServiceError(
        503,
        "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
      );
    }
    return withWorkerPrisma(env, PrismaClient, callback);
  };

  const withServices = <T>(
    c: ParcelamentoContext,
    callback: (services: {
      installments: ReturnType<typeof createInstallmentService>;
      competencies: ReturnType<typeof createInstallmentCompetencyService>;
      panoramas: ReturnType<typeof createPanoramaService>;
    }) => Promise<T>,
  ) =>
    withPrisma(c, (prisma) => {
      const audit = createParcelamentoAudit(envOf(c));
      const installments = createInstallmentService(prisma, audit);
      return callback({
        installments,
        competencies: createInstallmentCompetencyService(prisma, audit, installments),
        panoramas: createPanoramaService(prisma, audit),
      });
    });

  const withInstallmentReads = <T>(
    c: ParcelamentoContext,
    callback: (service: InstallmentServiceLike) => Promise<T>,
  ) =>
    options.installmentService
      ? callback(options.installmentService)
      : withServices(c, ({ installments }) => callback(installments));

  app.use("*", async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header(REQUEST_ID_HEADER, requestId);
  });

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "parcelamento-service" })),
  );

  app.get("/ready", async (c) => {
    await withPrisma(c, async (prisma) => {
      await prisma.$queryRaw`SELECT 1`;
    });
    return c.json(createSuccessResponse({ status: "ready", service: "parcelamento-service" }));
  });

  app.get("/openapi.json", (c) =>
    apiDocsEnabled(envOf(c))
      ? c.json(
          buildParcelamentoServiceOpenApiSpec({ port: 8787 } as Parameters<
            typeof buildParcelamentoServiceOpenApiSpec
          >[0]),
        )
      : c.notFound(),
  );
  app.get("/docs", (c) =>
    apiDocsEnabled(envOf(c))
      ? c.html(swaggerUiHtml("Parcelamento Service - OpenAPI"))
      : c.notFound(),
  );

  app.use("/parcelamento/*", async (c, next) => {
    c.set("auth", await authenticateParcelamentoRequest(c.req.raw, envOf(c)));
    await next();
  });

  app.get("/parcelamento/installments", (c) =>
    withInstallmentReads(c, async (service) => {
      const query = parseWithZod(listInstallmentsQuerySchema, queryOf(c));
      return c.json(createSuccessResponse(await service.list(requestContext(c), query)));
    }),
  );

  app.post("/parcelamento/installments", async (c) => {
    const body = parseWithZod(createInstallmentBodySchema, await readJson(c));
    const data = await withServices(c, ({ installments }) =>
      installments.create(requestContext(c), body),
    );
    return c.json(createSuccessResponse(data), 201);
  });

  app.get("/parcelamento/installments/:id", (c) =>
    withInstallmentReads(c, async (service) => {
      const params = parseWithZod(installmentIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.getById(requestContext(c), params.id)));
    }),
  );

  app.patch("/parcelamento/installments/:id", async (c) => {
    const params = parseWithZod(installmentIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(patchInstallmentBodySchema, await readJson(c));
    const data = await withServices(c, ({ installments }) =>
      installments.patch(requestContext(c), params.id, body),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/parcelamento/installments/:installmentId/competencies", async (c) => {
    const params = parseWithZod(installmentCompetencyParentParamsSchema, {
      installmentId: c.req.param("installmentId"),
    });
    const query = parseWithZod(listInstallmentCompetenciesQuerySchema, queryOf(c));
    const data = await withServices(c, ({ competencies }) =>
      competencies.list(requestContext(c), params.installmentId, query),
    );
    return c.json(createSuccessResponse(data));
  });

  app.post("/parcelamento/installments/:installmentId/competencies", async (c) => {
    const params = parseWithZod(installmentCompetencyParentParamsSchema, {
      installmentId: c.req.param("installmentId"),
    });
    const body = parseWithZod(createInstallmentCompetencyBodySchema, await readJson(c));
    const data = await withServices(c, ({ competencies }) =>
      competencies.create(requestContext(c), params.installmentId, body),
    );
    return c.json(createSuccessResponse(data), 201);
  });

  app.patch("/parcelamento/installment-competencies/:id", async (c) => {
    const params = parseWithZod(installmentCompetencyIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(patchInstallmentCompetencyBodySchema, await readJson(c));
    const data = await withServices(c, ({ competencies }) =>
      competencies.patch(requestContext(c), params.id, body),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/parcelamento/panoramas", async (c) => {
    const query = parseWithZod(listPanoramasQuerySchema, queryOf(c));
    const data = await withServices(c, ({ panoramas }) => panoramas.list(requestContext(c), query));
    return c.json(createSuccessResponse(data));
  });

  app.post("/parcelamento/panoramas", async (c) => {
    const body = parseWithZod(createPanoramaBodySchema, await readJson(c));
    const data = await withServices(c, ({ panoramas }) =>
      panoramas.create(requestContext(c), body),
    );
    return c.json(createSuccessResponse(data), 201);
  });

  app.post("/parcelamento/panoramas/competences/:competence/generate", async (c) => {
    const params = parseWithZod(panoramaCompetenceParamsSchema, {
      competence: c.req.param("competence"),
    });
    parseWithZod(generatePanoramasBodySchema, await readJson(c));
    const data = await withServices(c, ({ panoramas }) =>
      panoramas.generateForCompetence(requestContext(c), params.competence),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/parcelamento/panoramas/:id", async (c) => {
    const params = parseWithZod(panoramaIdParamsSchema, { id: c.req.param("id") });
    const data = await withServices(c, ({ panoramas }) =>
      panoramas.getById(requestContext(c), params.id),
    );
    return c.json(createSuccessResponse(data));
  });

  app.patch("/parcelamento/panoramas/:id", async (c) => {
    const params = parseWithZod(panoramaIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(patchPanoramaBodySchema, await readJson(c));
    const data = await withServices(c, ({ panoramas }) =>
      panoramas.patch(requestContext(c), params.id, body),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant({
      env: envOf(c),
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "catalog",
      source: "parcelamento.catalog",
      fields: [],
      body: {},
    });
    return c.json(createSuccessResponse(parcelamentoReportingCatalog));
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await readJson(c));
    const grant = await verifyReportingGrant({
      env: envOf(c),
      token: c.req.header("x-internal-service-token"),
      grant: c.req.header("x-reports-grant"),
      signature: c.req.header("x-reports-grant-signature"),
      requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const data = await withPrisma(c, (prisma) =>
      createReportingService(prisma).extract({
        organizationId: grant.organization_id,
        source: body.source,
        fields: body.fields,
        limit: body.limit,
        ...(body.query ? { query: body.query } : {}),
      }),
    );
    return c.json(createSuccessResponse(data));
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? c.req.header(REQUEST_ID_HEADER);
    const serialized = serializeError(error, {
      requestId,
      fallbackMessage: "Erro interno no parcelamento-service.",
    });
    if (requestId) c.header(REQUEST_ID_HEADER, requestId);
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
