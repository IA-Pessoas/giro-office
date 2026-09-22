import {
  createProposalConfigBodySchema,
  proposalConfigIdParamSchema,
  updateProposalConfigBodySchema,
} from "@workspace/commercial-service/src/schemas/proposalConfig.schemas.js";
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
import { authenticateCommercialRequest } from "./auth.js";
import type { CommercialWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

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
export type ProposalService = {
  list(organizationId: string): Promise<unknown>;
  detail(id: string, organizationId: string): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, id: string, input: Record<string, unknown>): Promise<unknown>;
  delete(organizationId: string, id: string): Promise<unknown>;
};
type CommercialOptions = {
  env?: CommercialWorkerEnv;
  prisma?: ProposalPrisma;
  proposalService?: ProposalService;
};
type CommercialWorkerContext = {
  Bindings: CommercialWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type CommercialContext = Context<CommercialWorkerContext>;

function localService(prisma: ProposalPrisma): ProposalService {
  return {
    list: (organizationId) =>
      prisma.proposalConfig.findMany({
        where: { organization_id: organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, contract_value: true },
      }),
    async detail(id, organizationId) {
      const row = await prisma.proposalConfig.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true, name: true, contract_value: true },
      });
      if (!row) throw new ServiceError(404, "Configuração comercial não encontrada.");
      return row;
    },
    async create(organizationId, input) {
      const duplicate = await prisma.proposalConfig.findFirst({
        where: { name: input.name, organization_id: organizationId },
      });
      if (duplicate) throw new ServiceError(409, "Já existe uma configuração com esse nome.");
      return prisma.proposalConfig.create({
        data: { ...input, organization_id: organizationId },
        select: { id: true, name: true, contract_value: true },
      });
    },
    async update(organizationId, id, input) {
      const current = (await this.detail(id, organizationId)) as Record<string, unknown>;
      const count = await prisma.proposalConfig.updateMany({
        where: { id, organization_id: organizationId },
        data: { ...input },
      });
      if (count.count !== 1) throw new ServiceError(404, "Configuração comercial não encontrada.");
      return { ...current, ...input, id };
    },
    async delete(organizationId, id) {
      const result = await prisma.proposalConfig.deleteMany({
        where: { id, organization_id: organizationId },
      });
      if (result.count !== 1) throw new ServiceError(404, "Configuração comercial não encontrada.");
      return { id, deleted: true };
    },
  };
}

export function createCommercialWorkerApp(options: CommercialOptions = {}) {
  const app = new Hono<CommercialWorkerContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "commercial-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "commercial-service" }));
  });
  app.use("/commercial/*", async (c, next) => {
    c.set("auth", await authenticateCommercialRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/commercial", async (c, next) => {
    c.set("auth", await authenticateCommercialRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: CommercialContext,
    callback: (service: ProposalService) => Promise<T>,
  ) => {
    if (options.proposalService) return callback(options.proposalService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as ProposalPrisma)),
    );
  };
  app.get("/commercial/proposal-configs", (c) =>
    withService(c, async (service) =>
      c.json(createSuccessResponse(await service.list(c.get("auth").organizationId))),
    ),
  );
  app.get("/commercial/proposal-configs/:id", (c) =>
    withService(c, async (service) => {
      const { id } = parseWithZod(proposalConfigIdParamSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.detail(id, c.get("auth").organizationId)));
    }),
  );
  app.post("/commercial/proposal-configs", (c) =>
    withService(c, async (service) => {
      const body = parseWithZod(createProposalConfigBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        201,
      );
    }),
  );
  app.patch("/commercial/proposal-configs/:id", (c) =>
    withService(c, async (service) => {
      const { id } = parseWithZod(proposalConfigIdParamSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateProposalConfigBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, id, body)),
      );
    }),
  );
  app.delete("/commercial/proposal-configs/:id", (c) =>
    withService(c, async (service) => {
      const { id } = parseWithZod(proposalConfigIdParamSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.delete(c.get("auth").organizationId, id)));
    }),
  );
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

export type { CommercialWorkerEnv } from "./env.js";
