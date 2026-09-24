import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { reportingQueryFields } from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError, type z } from "zod";
import {
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
} from "../../../services/client-service/src/schemas/client.schemas.js";
import {
  cnpjLookupQuerySchema,
  createClientPABodySchema,
  createHistoryBodySchema,
  createHistoryPendingBodySchema,
  createIntegrationBodySchema,
  historyIdParamsSchema,
  pendingDeleteParamsSchema,
  pendingListQuerySchema,
  terminationBodySchema,
  updateClientPABodySchema,
  updateFinanceBodySchema,
  updateHistoryBodySchema,
  updateIntegrationBodySchema,
  updateRegularizeBodySchema,
} from "../../../services/client-service/src/schemas/clientVerticals.schemas.js";
import { commercialProspectingTransitionEventSchema } from "../../../services/client-service/src/schemas/commercialProjection.schemas.js";
import { internalReportingExtractBodySchema } from "../../../services/client-service/src/schemas/internalReporting.schemas.js";
import { authenticateClientRequest, clientAuthorization, requireOrganization } from "./auth.js";
import { ClientService, type ClientWorkerService } from "./clientService.js";
import type { ClientWorkerEnv } from "./env.js";
import { WorkerHistoryStorage, type WorkerHistoryStorageLike } from "./historyStorage.js";
import { verifyReportingGrant } from "./internalReporting.js";
import { PrismaClient } from "./prisma.js";

export type { ClientWorkerService } from "./clientService.js";
export type { ClientWorkerEnv } from "./env.js";

type ClientBindings = {
  Bindings: ClientWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};

type ClientContext = Context<ClientBindings>;

type CreateClientWorkerAppOptions = {
  env: ClientWorkerEnv;
  clientService?: ClientWorkerService;
  historyStorage?: WorkerHistoryStorageLike;
};

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError)
      throw new ServiceError(400, error.issues[0]?.message ?? "Dados inválidos.");
    throw error;
  }
}

async function jsonBody(c: ClientContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

async function formOrJsonBody(c: ClientContext): Promise<Record<string, unknown>> {
  if (c.req.header("content-type")?.includes("multipart/form-data")) {
    const body = await c.req.parseBody();
    return body as Record<string, unknown>;
  }
  return (await jsonBody(c)) as Record<string, unknown>;
}

function organizationId(c: ClientContext): string {
  const auth = c.get("auth");
  requireOrganization(auth);
  return auth.organizationId;
}

function authz(c: ClientContext) {
  return clientAuthorization(c.get("auth"));
}

function pathParam(c: ClientContext, schema: z.ZodType<{ id: string }>): string {
  return parse(schema, { id: c.req.param("id") }).id;
}

async function saveHistoryFile(
  storage: WorkerHistoryStorageLike | undefined,
  clientId: string,
  value: unknown,
): Promise<string | undefined> {
  const file = value instanceof File ? value : undefined;
  if (!file) return undefined;
  if (!storage) throw new ServiceError(503, "Armazenamento de históricos não configurado.");
  return storage.upload(clientId, file);
}

function requireInternalToken(c: ClientContext, token: string | undefined): void {
  if (!token) throw new ServiceError(503, "Endpoint interno não configurado.");
  if (c.req.header(INTERNAL_SERVICE_TOKEN_HEADER) !== token)
    throw new ServiceError(403, "Acesso negado.");
}

function requireModule(
  c: ClientContext,
  module: string,
  minimum: number,
  ownerAllowed = false,
): void {
  const auth = c.get("auth");
  if (ownerAllowed && auth.claims.type === "owner") return;
  if ((auth.claims.modules[module as keyof typeof auth.claims.modules] ?? 0) < minimum) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

function requireDomainAccess(c: ClientContext, minimum: number): void {
  const auth = c.get("auth");
  if (auth.claims.type === "owner") return;
  const allowed = CLIENT_DOMAIN_MODULES.some(
    (module) => (auth.claims.modules[module] ?? 0) >= minimum,
  );
  if (!allowed) throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
}

const CLIENT_DOMAIN_MODULES = [
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "pessoal",
  "regularize",
] as const;

function requireClientList(c: ClientContext): void {
  const auth = c.get("auth");
  const modules = auth.claims.modules;
  const domainAccess = [
    "comercial",
    "contabil",
    "financeiro",
    "fiscal",
    "pessoal",
    "regularize",
  ].some((module) => (modules[module as keyof typeof modules] ?? 0) >= 1);
  if (
    !auth.isPlatformAdmin &&
    auth.claims.type !== "owner" &&
    (auth.claims.permission ?? 0) < 1 &&
    modules.integracao < 1 &&
    !domainAccess
  ) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

export function createClientWorkerApp(options: CreateClientWorkerAppOptions) {
  const app = new Hono<ClientBindings>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "client-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "client-service" })),
  );

  const authenticate = async (c: ClientContext, next: () => Promise<void>) => {
    const auth = await authenticateClientRequest(c.req.raw, options.env ?? c.env);
    c.set("auth", auth);
    await next();
  };
  app.use("/client", authenticate);
  app.use("/client/*", authenticate);

  const withService = async <T>(
    c: ClientContext,
    callback: (service: ClientWorkerService) => Promise<T>,
  ) => {
    if (options.clientService) return callback(options.clientService);
    const env = options.env ?? c.env;
    const historyStorage = options.historyStorage ?? WorkerHistoryStorage.fromEnv(env);
    return withWorkerPrisma(env, PrismaClient, async (client) =>
      callback(
        new ClientService(
          client,
          env.CNPJ_LOOKUP_API_URL,
          env.CNPJ_LOOKUP_API_TOKEN,
          historyStorage,
        ),
      ),
    );
  };

  app.get("/client/list", async (c) =>
    withService(c, async (service) => {
      const query = parse(listClientsQuerySchema, c.req.query());
      const organization = organizationId(c);
      requireClientList(c);
      if (query.organization_id && query.organization_id !== organization) {
        throw new ServiceError(403, "Acesso negado para esta organização.");
      }
      return c.json(
        createSuccessResponse(
          await service.listByOrganization(
            organization,
            {
              page: query.page ?? 1,
              pageSize: query.limit ?? 20,
              search: query.search,
              status: query.status,
              ref: query.ref,
            },
            authz(c),
          ),
        ),
      );
    }),
  );

  app.get("/client/integration", async (c) =>
    withService(c, async (service) => {
      requireModule(c, "integracao", 1, true);
      const query = parse(cnpjLookupQuerySchema, c.req.query());
      const cnpj = query.cnpj.replace(/[^a-zA-Z0-9]/g, "");
      if (cnpj.length !== 14)
        throw new ServiceError(400, "CNPJ deve conter 14 caracteres alfanuméricos.");
      return c.json(createSuccessResponse(await service.lookupCnpj(cnpj, organizationId(c))));
    }),
  );

  app.post("/client/integration", async (c) =>
    withService(c, async (service) => {
      requireModule(c, "integracao", 2, true);
      const body = parse(createIntegrationBodySchema, await jsonBody(c)) as Record<string, unknown>;
      const organization = organizationId(c);
      if (body.organization_id && body.organization_id !== organization) {
        throw new ServiceError(403, "Integração não permitida para outra organização.");
      }
      return c.json(
        createSuccessResponse(
          await service.createIntegration({ ...body, organization_id: organization }, authz(c)),
        ),
        201,
      );
    }),
  );

  app.post("/client", async (c) =>
    withService(c, async (service) => {
      const body = parse(createClientBodySchema, await jsonBody(c)) as Record<string, unknown>;
      const organization = organizationId(c);
      if (body.organization_id && body.organization_id !== organization) {
        throw new ServiceError(403, "Não é permitido criar cliente em outra organização.");
      }
      return c.json(
        createSuccessResponse(
          await service.create({ ...body, organization_id: organization }, authz(c)),
        ),
        201,
      );
    }),
  );

  app.get("/client/:id", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.getById(pathParam(c, clientIdParamsSchema), organizationId(c), authz(c)),
        ),
      ),
    ),
  );

  app.patch("/client/:id", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.update(
            pathParam(c, clientIdParamsSchema),
            organizationId(c),
            parse(updateClientBodySchema, await jsonBody(c)) as Record<string, unknown>,
            authz(c),
          ),
        ),
      ),
    ),
  );

  app.delete("/client/:id", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.deactivate(pathParam(c, clientIdParamsSchema), organizationId(c), authz(c)),
        ),
      ),
    ),
  );

  app.post("/client/:id/activate", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.activate(pathParam(c, clientIdParamsSchema), organizationId(c), authz(c)),
        ),
      ),
    ),
  );

  app.patch("/client/:id/integration", async (c) =>
    withService(c, async (service) => {
      requireModule(c, "integracao", 2, true);
      return c.json(
        createSuccessResponse(
          await service.updateIntegration(
            pathParam(c, clientIdParamsSchema),
            organizationId(c),
            parse(updateIntegrationBodySchema, await jsonBody(c)) as Record<string, unknown>,
            authz(c),
          ),
        ),
      );
    }),
  );

  app.post("/client/:id/pa", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      parse(createClientPABodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.createPA(id, organizationId(c))), 201);
    }),
  );

  app.get("/client/:id/pa", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      const detail = await service.getPADetail(id, organizationId(c));
      return c.json(createSuccessResponse({ detail }));
    }),
  );

  app.patch("/client/:id/pa", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      const body = parse(updateClientPABodySchema, await jsonBody(c));
      return c.json(createSuccessResponse(await service.updatePA(id, organizationId(c), body)));
    }),
  );

  app.patch("/client/:id/termination", async (c) =>
    withService(c, async (service) => {
      requireDomainAccess(c, 2);
      const id = pathParam(c, clientIdParamsSchema);
      const body = parse(terminationBodySchema, await jsonBody(c)) as Record<string, unknown>;
      return c.json(
        createSuccessResponse(
          await service.terminate(id, organizationId(c), c.get("auth").userId, body),
        ),
      );
    }),
  );

  app.patch("/client/:id/finance", async (c) =>
    withService(c, async (service) => {
      requireModule(c, "financeiro", 2);
      const id = pathParam(c, clientIdParamsSchema);
      const body = parse(updateFinanceBodySchema, await jsonBody(c)) as Record<string, unknown>;
      return c.json(
        createSuccessResponse(await service.updateFinance(id, organizationId(c), body)),
      );
    }),
  );

  app.patch("/client/:id/regularize", async (c) =>
    withService(c, async (service) => {
      requireModule(c, "regularize", 2);
      const id = pathParam(c, clientIdParamsSchema);
      const body = parse(updateRegularizeBodySchema, await jsonBody(c)) as Record<string, unknown>;
      return c.json(
        createSuccessResponse(
          await service.updateRegularize(id, organizationId(c), c.get("auth").userId, body),
        ),
      );
    }),
  );

  app.post("/internal/competence-output-update", async (c) => {
    requireInternalToken(c, (options.env ?? c.env).INTERNAL_SERVICE_TOKEN);
    return withService(c, async (service) =>
      c.json(createSuccessResponse(await service.runCompetenceOutputUpdate())),
    );
  });

  app.post("/internal/commercial/prospecting-transition", async (c) => {
    requireInternalToken(c, (options.env ?? c.env).INTERNAL_SERVICE_TOKEN);
    const event = parse(commercialProspectingTransitionEventSchema, await jsonBody(c));
    return withService(c, async (service) =>
      c.json(createSuccessResponse(await service.applyCommercialProjection(event))),
    );
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant({
      env: options.env ?? c.env,
      request: c.req.raw,
      operation: "catalog",
      source: "integracao.catalog",
      fields: [],
      body: {},
    });
    return withService(c, async (service) =>
      c.json(createSuccessResponse(await service.reportingCatalog())),
    );
  });

  app.post("/internal/reporting/extract", async (c) => {
    const body = parse(internalReportingExtractBodySchema, await jsonBody(c));
    const grant = await verifyReportingGrant({
      env: options.env ?? c.env,
      request: c.req.raw,
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    return withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.extractReporting({
            organizationId: grant.organization_id,
            source: body.source,
            fields: body.fields,
            limit: body.limit,
            ...(body.query ? { query: body.query } : {}),
          }),
        ),
      ),
    );
  });

  app.post("/client/:id/histories", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      const { file: attachment, ...fields } = await formOrJsonBody(c);
      const parsed = parse(createHistoryBodySchema, fields);
      const file = await saveHistoryFile(
        options.historyStorage ?? WorkerHistoryStorage.fromEnv(options.env ?? c.env),
        id,
        attachment,
      );
      return c.json(
        createSuccessResponse(
          await service.createHistory(id, organizationId(c), c.get("auth").userId, {
            date: parsed.date,
            history: parsed.history,
            ...(parsed.pending_id ? { pending_id: parsed.pending_id } : {}),
            ...(file ? { file } : {}),
          }),
        ),
        201,
      );
    }),
  );

  app.get("/client/:id/histories", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.listHistories(pathParam(c, clientIdParamsSchema), organizationId(c)),
        ),
      ),
    ),
  );

  app.get("/client/:id/histories/:historyId", async (c) =>
    withService(c, async (service) => {
      const params = parse(historyIdParamsSchema, {
        id: c.req.param("id"),
        historyId: c.req.param("historyId"),
      });
      return c.json(
        createSuccessResponse(
          await service.getHistory(params.id, params.historyId, organizationId(c)),
        ),
      );
    }),
  );

  app.get("/client/:id/histories/:historyId/file", async (c) =>
    withService(c, async (service) => {
      const params = parse(historyIdParamsSchema, {
        id: c.req.param("id"),
        historyId: c.req.param("historyId"),
      });
      return c.json(
        createSuccessResponse(
          await service.getHistoryFileUrl(params.id, params.historyId, organizationId(c)),
        ),
      );
    }),
  );

  app.patch("/client/:id/histories/:historyId", async (c) =>
    withService(c, async (service) => {
      const params = parse(historyIdParamsSchema, {
        id: c.req.param("id"),
        historyId: c.req.param("historyId"),
      });
      const body = parse(updateHistoryBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.updateHistory(
            params.historyId,
            organizationId(c),
            c.get("auth").userId,
            body,
          ),
        ),
      );
    }),
  );

  app.post("/client/:id/histories/pending", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      const body = parse(createHistoryPendingBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.createPending(id, organizationId(c), c.get("auth").userId, body.reason),
        ),
        201,
      );
    }),
  );

  app.get("/client/histories/pending", async (c) =>
    withService(c, async (service) => {
      const query = parse(pendingListQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await service.listPending(organizationId(c), query.user_id)),
      );
    }),
  );

  app.delete("/client/histories/pending/:pendingId", async (c) =>
    withService(c, async (service) => {
      if ((c.get("auth").claims.permission ?? 0) < 2 && c.get("auth").claims.type !== "owner") {
        throw new ServiceError(403, "Usuário não tem permissão.");
      }
      const { pendingId } = parse(pendingDeleteParamsSchema, {
        pendingId: c.req.param("pendingId"),
      });
      await service.deletePending(pendingId, organizationId(c));
      return c.json(createSuccessResponse({ ok: true }));
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no client-service.",
    });
    if (serialized.statusCode === 409) c.header("x-auth-session-state", "superseded");
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
