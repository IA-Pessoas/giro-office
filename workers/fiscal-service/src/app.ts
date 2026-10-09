import { buildFiscalServiceOpenApiSpec } from "@workspace/fiscal-service/src/openapi/spec.js";
import { InternalReportingService } from "@workspace/fiscal-service/src/reporting/internalReportingService.js";
import {
  documentConferenceBodySchema,
  xmlSelectionBodySchema,
} from "@workspace/fiscal-service/src/schemas/documentConference.schemas.js";
import {
  createFiscalRateBodySchema,
  fiscalRateIdParamsSchema,
  listFiscalRatesQuerySchema,
} from "@workspace/fiscal-service/src/schemas/fiscalRate.schemas.js";
import { fiscalSearchQuerySchema } from "@workspace/fiscal-service/src/schemas/fiscalSearch.schemas.js";
import {
  createIcmsBodySchema,
  detailIcmsQuerySchema,
  listIcmsQuerySchema,
  updateIcmsBodySchema,
} from "@workspace/fiscal-service/src/schemas/icms.schemas.js";
import { internalReportingExtractBodySchema } from "@workspace/fiscal-service/src/schemas/internalReporting.schemas.js";
import {
  createIpiBodySchema,
  detailIpiQuerySchema,
  listIpiQuerySchema,
  updateIpiBodySchema,
} from "@workspace/fiscal-service/src/schemas/ipi.schemas.js";
import {
  createMonthlyRevenueBodySchema,
  listMonthlyRevenuesQuerySchema,
  monthlyRevenueIdParamsSchema,
  updateMonthlyRevenueBodySchema,
} from "@workspace/fiscal-service/src/schemas/monthlyRevenue.schemas.js";
import {
  createNcmBodySchema,
  detailNcmQuerySchema,
  listNcmQuerySchema,
  updateNcmBodySchema,
} from "@workspace/fiscal-service/src/schemas/ncm.schemas.js";
import {
  simplesBatchBodySchema,
  simplesPdfQuerySchema,
  simplesPreviewQuerySchema,
} from "@workspace/fiscal-service/src/schemas/simplesRate.schemas.js";
import {
  compareDocumentSpreadsheets,
  documentConferenceCsvExport,
} from "@workspace/fiscal-service/src/services/documentConferenceService.js";
import {
  fiscalRatePdfHeaders,
  renderFiscalRatePdf,
} from "@workspace/fiscal-service/src/services/fiscalRatePdfService.js";
import { FiscalRateService } from "@workspace/fiscal-service/src/services/fiscalRateService.js";
import { IcmsService } from "@workspace/fiscal-service/src/services/icmsService.js";
import { MonthlyRevenueService } from "@workspace/fiscal-service/src/services/monthlyRevenueService.js";
import { simplesRateCsvExport } from "@workspace/fiscal-service/src/services/simplesRateCsvService.js";
import {
  renderSimplesRatePdf,
  simplesRatePdfHeaders,
} from "@workspace/fiscal-service/src/services/simplesRatePdfService.js";
import { SimplesRateService } from "@workspace/fiscal-service/src/services/simplesRateService.js";
import { simplesRateZipExport } from "@workspace/fiscal-service/src/services/simplesRateZipService.js";
import { selectXmlFromZip } from "@workspace/fiscal-service/src/services/xmlSelectionService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import {
  fiscalIcmsReportingCatalog,
  fiscalIpiReportingCatalog,
  fiscalNcmReportingCatalog,
  parseWithZod,
  reportingQueryFields,
} from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodTypeAny } from "zod";
import { createFiscalAudit, requireAuditConfigured } from "./audit.js";
import { authenticateFiscalRequest, authorizeFiscalRequest } from "./auth.js";
import type { FiscalWorkerEnv } from "./env.js";
import { FiscalSearchService, IpiService, NcmService } from "./fiscalServices.js";
import { PrismaClient } from "./prisma.js";
import { verifyReportingGrant } from "./reporting.js";

export type { FiscalWorkerEnv } from "./env.js";

// biome-ignore lint/suspicious/noExplicitAny: contrato estrutural dos services CRUD fiscais.
type CrudArgs = any;
type CrudService = {
  create(data: CrudArgs): Promise<unknown>;
  update(data: CrudArgs): Promise<unknown>;
  delete(data: CrudArgs): Promise<unknown>;
  detail(id: string, organizationId: string): Promise<unknown>;
  list(query: CrudArgs, organizationId: string): Promise<unknown>;
};
type SearchServiceLike = Pick<FiscalSearchService, "searchByNcmCode">;
type ReportingServiceLike = Pick<InternalReportingService, "extract">;
type RateServiceLike = Pick<FiscalRateService, "create" | "list" | "get">;
type RevenueServiceLike = Pick<MonthlyRevenueService, "create" | "update" | "list">;
type SimplesServiceLike = Pick<SimplesRateService, "preview" | "emission" | "batch">;

interface FiscalWorkerOptions {
  env: FiscalWorkerEnv;
  icmsService?: CrudService;
  ncmService?: CrudService;
  ipiService?: CrudService;
  searchService?: SearchServiceLike;
  reportingService?: ReportingServiceLike;
  rateService?: RateServiceLike;
  revenueService?: RevenueServiceLike;
  simplesService?: SimplesServiceLike;
}

type FiscalContext = {
  Bindings: FiscalWorkerEnv;
  Variables: { auth: WorkerAuthContext; requestId: string };
};

type WorkerServices = {
  icmsService: CrudService;
  ncmService: CrudService;
  ipiService: CrudService;
  searchService: SearchServiceLike;
  reportingService: ReportingServiceLike;
  rateService: RateServiceLike;
  revenueService: RevenueServiceLike;
  simplesService: SimplesServiceLike;
};

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "DENY",
} as const;

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
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

export function createFiscalWorkerApp(options: FiscalWorkerOptions) {
  const { env } = options;
  const app = new Hono<FiscalContext>();
  const allowedOrigins = (env.SERVICE_ALLOWED_ORIGINS ?? "*").split(",").map((o) => o.trim());

  app.use("*", async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    c.set("requestId", requestId);
    c.header(REQUEST_ID_HEADER, requestId);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.header(name, value);
    if (env.NODE_ENV === "production") {
      c.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    const origin = c.req.header("origin");
    if (origin) {
      if (!allowedOrigins.includes("*") && !allowedOrigins.includes(origin)) {
        throw new ServiceError(403, "Origem não permitida.");
      }
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-credentials", "true");
      c.header("access-control-allow-methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
      c.header(
        "access-control-allow-headers",
        "Content-Type, Authorization, Idempotency-Key, x-request-id, x-csrf-token",
      );
      c.header("access-control-expose-headers", "x-auth-session-state");
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "fiscal-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "fiscal-service" })),
  );
  if (isEnabled(env.ENABLE_API_DOCS) && env.NODE_ENV !== "production") {
    app.get("/openapi.json", (c) =>
      c.json(
        buildFiscalServiceOpenApiSpec({ port: 8787 } as Parameters<
          typeof buildFiscalServiceOpenApiSpec
        >[0]),
      ),
    );
    app.get("/docs", (c) => c.html(swaggerUiHtml("fiscal-service — OpenAPI")));
  }

  const authenticate: MiddlewareHandler<FiscalContext> = async (c, next) => {
    const auth = await authenticateFiscalRequest(c.req.raw, env);
    authorizeFiscalRequest(c.req.raw, auth);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) requireAuditConfigured(env);
    c.set("auth", auth);
    await next();
  };
  app.use("/fiscal", authenticate);
  app.use("/fiscal/*", authenticate);

  const withService = async <K extends keyof WorkerServices, T>(
    key: K,
    callback: (service: WorkerServices[K]) => Promise<T>,
  ): Promise<T> => {
    const injected = options[key] as WorkerServices[K] | undefined;
    if (injected) return callback(injected);
    if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
      throw new ServiceError(
        503,
        "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
      );
    }
    return withWorkerPrisma(env, PrismaClient, (client) => {
      const prisma = client as unknown as ConstructorParameters<typeof IcmsService>[0] &
        ConstructorParameters<typeof FiscalSearchService>[0] &
        ConstructorParameters<typeof FiscalRateService>[0] &
        ConstructorParameters<typeof MonthlyRevenueService>[0] &
        ConstructorParameters<typeof SimplesRateService>[0] &
        ConstructorParameters<typeof InternalReportingService>[0];
      const factories: { [S in keyof WorkerServices]: () => WorkerServices[S] } = {
        icmsService: () => new IcmsService(prisma, createFiscalAudit(env)),
        ncmService: () => new NcmService(prisma, createFiscalAudit(env)),
        ipiService: () => new IpiService(prisma, createFiscalAudit(env)),
        searchService: () => new FiscalSearchService(prisma),
        reportingService: () => new InternalReportingService(prisma),
        rateService: () => new FiscalRateService(prisma, createFiscalAudit(env)),
        revenueService: () => new MonthlyRevenueService(prisma, createFiscalAudit(env)),
        simplesService: () => new SimplesRateService(prisma),
      };
      return callback(factories[key]());
    });
  };

  const actor = (c: Context<FiscalContext>) => {
    const auth = c.get("auth");
    return {
      userId: auth.userId,
      organizationId: auth.organizationId,
      permission: auth.claims.permission,
    };
  };

  app.post("/fiscal/rates", async (c) => {
    const body = parseWithZod(createFiscalRateBodySchema, await readJson(c));
    const data = await withService("rateService", (service) =>
      service.create({ ...actor(c), ...body }),
    );
    return c.json(createSuccessResponse(data), 201);
  });

  app.get("/fiscal/rates/list", async (c) => {
    const query = parseWithZod(listFiscalRatesQuerySchema, {
      client_id: c.req.query("client_id"),
      competence: c.req.query("competence"),
      tax_type: c.req.query("tax_type"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    });
    const data = await withService("rateService", (service) =>
      service.list(query, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/fiscal/rates/:id/pdf", async (c) => {
    const { id } = parseWithZod(fiscalRateIdParamsSchema, { id: c.req.param("id") });
    const rate = await withService("rateService", (service) =>
      service.get(id, c.get("auth").organizationId),
    );
    const pdf = await renderFiscalRatePdf(rate);
    return new Response(new Uint8Array(pdf), {
      headers: fiscalRatePdfHeaders(rate),
    });
  });

  app.post("/fiscal/revenues", async (c) => {
    const body = parseWithZod(createMonthlyRevenueBodySchema, await readJson(c));
    const data = await withService("revenueService", (service) =>
      service.create({ ...actor(c), ...body }),
    );
    return c.json(createSuccessResponse(data), 201);
  });

  app.get("/fiscal/revenues/list", async (c) => {
    const query = parseWithZod(listMonthlyRevenuesQuerySchema, {
      client_id: c.req.query("client_id"),
      from: c.req.query("from"),
      to: c.req.query("to"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    });
    const data = await withService("revenueService", (service) =>
      service.list(query, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/fiscal/simples/preview", async (c) => {
    const query = parseWithZod(simplesPreviewQuerySchema, {
      client_id: c.req.query("client_id"),
      competence: c.req.query("competence"),
    });
    const data = await withService("simplesService", (service) =>
      service.preview(query, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(data));
  });

  app.get("/fiscal/simples/pdf", async (c) => {
    const query = parseWithZod(simplesPdfQuerySchema, {
      client_id: c.req.query("client_id"),
      competence: c.req.query("competence"),
      annex: c.req.query("annex"),
    });
    const emission = await withService("simplesService", (service) =>
      service.emission(query, c.get("auth").organizationId),
    );
    const pdf = await renderSimplesRatePdf(emission);
    return new Response(new Uint8Array(pdf), { headers: simplesRatePdfHeaders(emission) });
  });

  app.post("/fiscal/simples/csv", async (c) => {
    const body = parseWithZod(simplesBatchBodySchema, await readJson(c));
    const batch = await withService("simplesService", (service) =>
      service.batch(body, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(simplesRateCsvExport(batch)));
  });

  app.post("/fiscal/simples/zip", async (c) => {
    const body = parseWithZod(simplesBatchBodySchema, await readJson(c));
    const batch = await withService("simplesService", (service) =>
      service.batch(body, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(await simplesRateZipExport(batch)));
  });

  // Conferência de arquivos: processa só o que foi enviado, sem banco nem efeito em controles.
  app.post("/fiscal/conferences/documents", async (c) => {
    const body = parseWithZod(documentConferenceBodySchema, await readJson(c));
    const result = compareDocumentSpreadsheets(body);
    return c.json(createSuccessResponse({ ...result, ...documentConferenceCsvExport(result) }));
  });

  app.post("/fiscal/conferences/xml-selection", async (c) => {
    const body = parseWithZod(xmlSelectionBodySchema, await readJson(c));
    return c.json(createSuccessResponse(selectXmlFromZip(body)));
  });

  app.put("/fiscal/revenues/:id", async (c) => {
    const { id } = parseWithZod(monthlyRevenueIdParamsSchema, { id: c.req.param("id") });
    const { amount } = parseWithZod(updateMonthlyRevenueBodySchema, await readJson(c));
    const data = await withService("revenueService", (service) =>
      service.update({ ...actor(c), id, amount }),
    );
    return c.json(createSuccessResponse(data));
  });

  const crudRoutes: {
    path: string;
    service: "icmsService" | "ncmService" | "ipiService";
    idKey: string;
    listKey: string;
    create: ZodTypeAny;
    update: ZodTypeAny;
    detail: ZodTypeAny;
    list: ZodTypeAny;
  }[] = [
    {
      path: "/fiscal/icms",
      service: "icmsService",
      idKey: "icms_id",
      listKey: "icmsCodes",
      create: createIcmsBodySchema,
      update: updateIcmsBodySchema,
      detail: detailIcmsQuerySchema,
      list: listIcmsQuerySchema,
    },
    {
      path: "/fiscal/ncm",
      service: "ncmService",
      idKey: "ncm_id",
      listKey: "ncmCodes",
      create: createNcmBodySchema,
      update: updateNcmBodySchema,
      detail: detailNcmQuerySchema,
      list: listNcmQuerySchema,
    },
    {
      path: "/fiscal/ipi",
      service: "ipiService",
      idKey: "ipi_id",
      listKey: "ipiCodes",
      create: createIpiBodySchema,
      update: updateIpiBodySchema,
      detail: detailIpiQuerySchema,
      list: listIpiQuerySchema,
    },
  ];

  for (const route of crudRoutes) {
    const idQuery = (c: Context<FiscalContext>): string =>
      parseWithZod(route.detail, { [route.idKey]: c.req.query(route.idKey) })[route.idKey];

    app.get(`${route.path}/list`, async (c) => {
      const url = new URL(c.req.url);
      const codes = url.searchParams.getAll(route.listKey);
      const query = parseWithZod(route.list, {
        [route.listKey]: codes.length > 0 ? codes : undefined,
        page: url.searchParams.get("page") ?? undefined,
        page_size: url.searchParams.get("page_size") ?? undefined,
      });
      const data = await withService(route.service, (s) =>
        s.list(query, c.get("auth").organizationId),
      );
      return c.json(createSuccessResponse(data));
    });

    app.get(route.path, async (c) => {
      const id = idQuery(c);
      const data = await withService(route.service, (s) =>
        s.detail(id, c.get("auth").organizationId),
      );
      return c.json(createSuccessResponse(data));
    });

    app.post(route.path, async (c) => {
      const body = parseWithZod(route.create, await readJson(c));
      const data = await withService(route.service, (s) => s.create({ ...actor(c), ...body }));
      return c.json(createSuccessResponse(data), 201);
    });

    app.put(route.path, async (c) => {
      const body = parseWithZod(route.update, await readJson(c));
      const data = await withService(route.service, (s) => s.update({ ...actor(c), ...body }));
      return c.json(createSuccessResponse(data));
    });

    app.delete(route.path, async (c) => {
      const id = idQuery(c);
      const data = await withService(route.service, (s) =>
        s.delete({ ...actor(c), [route.idKey]: id }),
      );
      return c.json(createSuccessResponse(data));
    });
  }

  app.get("/fiscal/ncm-search", async (c) => {
    const query = parseWithZod(fiscalSearchQuerySchema, { ncmCode: c.req.query("ncmCode") });
    const data = await withService("searchService", (s) =>
      s.searchByNcmCode(query.ncmCode, c.get("auth").organizationId),
    );
    return c.json(createSuccessResponse(data));
  });

  const grantInput = (c: Context<FiscalContext>) => ({
    env,
    token: c.req.header("x-internal-service-token"),
    grant: c.req.header("x-reports-grant"),
    signature: c.req.header("x-reports-grant-signature"),
    requestId: c.req.header(REQUEST_ID_HEADER) ?? "",
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant({
      ...grantInput(c),
      operation: "catalog",
      source: "fiscal.catalog",
      fields: [],
      body: {},
    });
    return c.json(
      createSuccessResponse({
        sources: [
          ...fiscalIcmsReportingCatalog.sources,
          ...fiscalNcmReportingCatalog.sources,
          ...fiscalIpiReportingCatalog.sources,
        ],
        relations: [],
      }),
    );
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await readJson(c));
    const grant = await verifyReportingGrant({
      ...grantInput(c),
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    const data = await withService("reportingService", (s) =>
      s.extract({
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
    const serialized = serializeError(error, {
      requestId: c.get("requestId") ?? c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no fiscal-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
