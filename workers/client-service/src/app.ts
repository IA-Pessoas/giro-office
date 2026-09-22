import {
  createSupabaseStorageClient,
  type SupabaseStorageClient,
  type WorkerAuthContext,
  withWorkerPrisma,
} from "@workspace/runtime";
import {
  createSuccessResponse,
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
  createHistoryBodySchema,
  createHistoryPendingBodySchema,
  createIntegrationBodySchema,
  historyIdParamsSchema,
  pendingDeleteParamsSchema,
  pendingListQuerySchema,
  updateHistoryBodySchema,
  updateIntegrationBodySchema,
} from "../../../services/client-service/src/schemas/clientVerticals.schemas.js";
import { authenticateClientRequest, clientAuthorization, requireOrganization } from "./auth.js";
import { ClientService, type ClientWorkerService } from "./clientService.js";
import type { ClientWorkerEnv } from "./env.js";
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
  historyStorage?: SupabaseStorageClient;
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

function filePath(clientId: string, file: File): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `clients/historys/${clientId}/${crypto.randomUUID()}_${safeName}`;
}

async function saveHistoryFile(
  env: ClientWorkerEnv,
  storage: SupabaseStorageClient | undefined,
  clientId: string,
  body: Record<string, unknown>,
): Promise<string | undefined> {
  const file = body.file instanceof File ? body.file : undefined;
  if (!file) return undefined;
  const client =
    storage ??
    (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? createSupabaseStorageClient({
          SUPABASE_URL: env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        })
      : undefined);
  if (!client) throw new ServiceError(503, "Armazenamento de históricos não configurado.");
  const path = filePath(clientId, file);
  await client.upload(env.CLIENT_HISTORY_BUCKET ?? "ClientHistory", path, file, {
    contentType: file.type,
    upsert: false,
  });
  return path;
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
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) =>
      callback(new ClientService(client, (options.env ?? c.env).CNPJ_SERVICE)),
    );
  };

  app.get("/client/list", async (c) =>
    withService(c, async (service) => {
      const query = parse(listClientsQuerySchema, c.req.query());
      const organization = organizationId(c);
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
      const query = parse(cnpjLookupQuerySchema, c.req.query());
      const cnpj = query.cnpj.replace(/[^a-zA-Z0-9]/g, "");
      if (cnpj.length !== 14)
        throw new ServiceError(400, "CNPJ deve conter 14 caracteres alfanuméricos.");
      return c.json(createSuccessResponse(await service.lookupCnpj(cnpj, organizationId(c))));
    }),
  );

  app.post("/client/integration", async (c) =>
    withService(c, async (service) => {
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
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.updateIntegration(
            pathParam(c, clientIdParamsSchema),
            organizationId(c),
            parse(updateIntegrationBodySchema, await jsonBody(c)) as Record<string, unknown>,
            authz(c),
          ),
        ),
      ),
    ),
  );

  app.post("/client/:id/histories", async (c) =>
    withService(c, async (service) => {
      const id = pathParam(c, clientIdParamsSchema);
      const body = await formOrJsonBody(c);
      const parsed = parse(createHistoryBodySchema, body);
      const file = await saveHistoryFile(options.env ?? c.env, options.historyStorage, id, body);
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
