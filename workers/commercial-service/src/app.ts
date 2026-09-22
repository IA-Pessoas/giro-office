import {
  createProposalConfigBodySchema,
  proposalConfigIdParamSchema,
  updateProposalConfigBodySchema,
} from "@workspace/commercial-service/src/schemas/proposalConfig.schemas.js";
import {
  createProspectingBodySchema,
  prospectingIdParamSchema,
  updateProspectingBodySchema,
} from "@workspace/commercial-service/src/schemas/prospecting.schemas.js";
import {
  taskBillingIdParamSchema,
  updateTaskBillingBodySchema,
} from "@workspace/commercial-service/src/schemas/taskBilling.schemas.js";
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
import {
  authenticateCommercialRequest,
  requireCommercialModule,
  requireOrganization,
} from "./auth.js";
import {
  type BillingService,
  CommercialOutboxStatusService,
  type CommercialPrisma,
  CommercialProposalConfigService,
  CommercialProspectingService,
  CommercialTaskBillingService,
  createCommercialServices,
  type OutboxStatusService,
  type ProposalService,
  type ProspectingService,
} from "./commercialService.js";
import type { CommercialWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

export type { CommercialPrisma } from "./commercialService.js";
export type { CommercialWorkerEnv } from "./env.js";

export type ProposalPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  proposalConfig: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};

export type CommercialWorkerServices = {
  proposal: ProposalService;
  prospecting: ProspectingService;
  billing: BillingService;
  outbox: OutboxStatusService;
};

type CommercialWorkerContext = {
  Bindings: CommercialWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type CommercialContext = Context<CommercialWorkerContext>;

type CommercialWorkerOptions = {
  env?: CommercialWorkerEnv;
  prisma?: ProposalPrisma | CommercialPrisma;
  services?: CommercialWorkerServices;
  proposalService?: ProposalService;
  prospectingService?: ProspectingService;
  taskBillingService?: BillingService;
  outboxStatusService?: OutboxStatusService;
};

function organization(c: CommercialContext): string {
  const auth = c.get("auth");
  requireOrganization(auth);
  return auth.organizationId;
}

function user(c: CommercialContext): string {
  return c.get("auth").userId;
}

async function jsonBody(c: CommercialContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function idParam(
  c: CommercialContext,
  schema:
    | typeof proposalConfigIdParamSchema
    | typeof prospectingIdParamSchema
    | typeof taskBillingIdParamSchema,
  name: string,
): string {
  const parsed = parseWithZod(schema, { [name]: c.req.param(name) }) as Record<string, string>;
  return parsed[name];
}

function requireRead(c: CommercialContext): void {
  requireOrganization(c.get("auth"));
  requireCommercialModule(c.get("auth"), 1);
}

function requireWrite(c: CommercialContext): void {
  requireOrganization(c.get("auth"));
  requireCommercialModule(c.get("auth"), 2);
}

function proposalAuditContext(c: CommercialContext) {
  return {
    userId: c.get("auth").userId,
    auditCorrelationId: c.req.header(REQUEST_ID_HEADER),
  };
}

function requireDatabase(env: CommercialWorkerEnv): void {
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new ServiceError(
      503,
      "Banco de dados indisponível: configure o binding HYPERDRIVE ou o secret DATABASE_URL.",
    );
  }
}

function injectedServices(options: CommercialWorkerOptions): CommercialWorkerServices | undefined {
  if (options.services) return options.services;
  if (
    options.proposalService ||
    options.prospectingService ||
    options.taskBillingService ||
    options.outboxStatusService
  ) {
    return {
      proposal: options.proposalService as ProposalService,
      prospecting: options.prospectingService as ProspectingService,
      billing: options.taskBillingService as BillingService,
      outbox: options.outboxStatusService as OutboxStatusService,
    };
  }
  return undefined;
}

export function createCommercialWorkerApp(options: CommercialWorkerOptions = {}) {
  const app = new Hono<CommercialWorkerContext>();
  const configuredEnv = options.env;

  app.use("*", async (c, next) => {
    c.header(REQUEST_ID_HEADER, c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID());
    await next();
  });
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "commercial-service" })),
  );
  app.get("/ready", async (c) => {
    const env = configuredEnv ?? c.env;
    if (options.prisma) {
      await (options.prisma as ProposalPrisma).$queryRaw`SELECT 1`;
    } else {
      requireDatabase(env);
      await withWorkerPrisma(env, PrismaClient, (client) => client.$queryRaw`SELECT 1`);
    }
    return c.json(createSuccessResponse({ status: "ready", service: "commercial-service" }));
  });

  const authenticate = async (c: CommercialContext, next: () => Promise<void>) => {
    c.set("auth", await authenticateCommercialRequest(c.req.raw, configuredEnv ?? c.env));
    await next();
  };
  app.use("/commercial", authenticate);
  app.use("/commercial/*", authenticate);

  const withServices = async <T>(
    c: CommercialContext,
    callback: (services: CommercialWorkerServices) => Promise<T>,
  ): Promise<T> => {
    const injected = injectedServices(options);
    if (injected) return callback(injected);
    const env = configuredEnv ?? c.env;
    if (options.prisma) {
      return callback(createCommercialServices(options.prisma as CommercialPrisma, env, c.req.url));
    }
    requireDatabase(env);
    return withWorkerPrisma(env, PrismaClient, (client) =>
      callback(createCommercialServices(client as unknown as CommercialPrisma, env, c.req.url)),
    );
  };

  app.get("/commercial/proposal-configs", async (c) => {
    requireRead(c);
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.proposal.list(organization(c)))),
    );
  });
  app.get("/commercial/proposal-configs/:id", async (c) => {
    requireRead(c);
    const id = idParam(c, proposalConfigIdParamSchema, "id");
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.proposal.detail(id, organization(c)))),
    );
  });
  app.post("/commercial/proposal-configs", async (c) => {
    requireWrite(c);
    const body = parseWithZod(createProposalConfigBodySchema, await jsonBody(c));
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.proposal.create(organization(c), body, proposalAuditContext(c)),
        ),
        201,
      ),
    );
  });
  app.patch("/commercial/proposal-configs/:id", async (c) => {
    requireWrite(c);
    const id = idParam(c, proposalConfigIdParamSchema, "id");
    const body = parseWithZod(updateProposalConfigBodySchema, await jsonBody(c));
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.proposal.update(organization(c), id, body, proposalAuditContext(c)),
        ),
      ),
    );
  });
  app.delete("/commercial/proposal-configs/:id", async (c) => {
    requireWrite(c);
    const id = idParam(c, proposalConfigIdParamSchema, "id");
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.proposal.delete(organization(c), id, proposalAuditContext(c)),
        ),
      ),
    );
  });

  app.get("/commercial/prospecting/clients", async (c) => {
    requireRead(c);
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.prospecting.listClients(organization(c)))),
    );
  });
  app.get("/commercial/prospecting", async (c) => {
    requireRead(c);
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.prospecting.list(organization(c)))),
    );
  });
  app.get("/commercial/prospecting/:id", async (c) => {
    requireRead(c);
    const id = idParam(c, prospectingIdParamSchema, "id");
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.prospecting.detail(id, organization(c)))),
    );
  });
  app.post("/commercial/prospecting", async (c) => {
    requireWrite(c);
    const body = parseWithZod(createProspectingBodySchema, await jsonBody(c));
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.prospecting.create({
            user_id: user(c),
            organization_id: organization(c),
            ...body,
            audit_correlation_id: c.req.header(REQUEST_ID_HEADER),
          }),
        ),
        201,
      ),
    );
  });
  app.patch("/commercial/prospecting/:id", async (c) => {
    requireWrite(c);
    const id = idParam(c, prospectingIdParamSchema, "id");
    const body = parseWithZod(updateProspectingBodySchema, await jsonBody(c));
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.prospecting.update({
            user_id: user(c),
            organization_id: organization(c),
            prospecting_id: id,
            ...body,
            audit_correlation_id: c.req.header(REQUEST_ID_HEADER),
          }),
        ),
      ),
    );
  });
  app.delete("/commercial/prospecting/:id", async (c) => {
    requireWrite(c);
    const id = idParam(c, prospectingIdParamSchema, "id");
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.prospecting.archive({
            user_id: user(c),
            organization_id: organization(c),
            prospecting_id: id,
            audit_correlation_id: c.req.header(REQUEST_ID_HEADER),
          }),
        ),
      ),
    );
  });

  app.get("/commercial/task-billing", async (c) => {
    requireRead(c);
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.billing.list(organization(c)))),
    );
  });
  app.put("/commercial/task-billing/:taskId", async (c) => {
    requireWrite(c);
    const taskId = idParam(c, taskBillingIdParamSchema, "taskId");
    const body = parseWithZod(updateTaskBillingBodySchema, await jsonBody(c));
    return withServices(c, async (services) =>
      c.json(
        createSuccessResponse(
          await services.billing.update({
            user_id: user(c),
            organization_id: organization(c),
            task_id: taskId,
            ...body,
            audit_correlation_id: c.req.header(REQUEST_ID_HEADER),
          }),
        ),
      ),
    );
  });

  app.get("/commercial/outbox/status", async (c) => {
    requireRead(c);
    return withServices(c, async (services) =>
      c.json(createSuccessResponse(await services.outbox.status(organization(c)))),
    );
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no commercial-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export {
  CommercialOutboxStatusService,
  CommercialProposalConfigService,
  CommercialProspectingService,
  CommercialTaskBillingService,
};
