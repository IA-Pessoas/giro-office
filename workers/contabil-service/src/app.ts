import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, REQUEST_ID_HEADER, serializeError } from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { listControlQuerySchema } from "../../../services/contabil-service/src/schemas/control.schemas.js";
import { authenticateContabilRequest } from "./auth.js";
import type { ContabilWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

export type { ContabilWorkerEnv } from "./env.js";

type ClientRow = {
  id: string;
  name: string;
  company_name: string | null;
  controlContabil: Array<Record<string, unknown>>;
  triageClosings: Array<Record<string, unknown>>;
};
type ContabilPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  client: { findMany(args: Record<string, unknown>): Promise<ClientRow[]> };
};
type ControlServiceLike = {
  list(competence: string, organizationId: string): Promise<Record<string, unknown>>;
};
type ContabilOptions = {
  env?: ContabilWorkerEnv;
  controlService?: ControlServiceLike;
  prisma?: ContabilPrisma;
};
type ContabilContext = { Bindings: ContabilWorkerEnv; Variables: { auth: WorkerAuthContext } };

function createControlService(prisma: ContabilPrisma): ControlServiceLike {
  return {
    async list(competence, organizationId) {
      const clients = await prisma.client.findMany({
        where: { organization_id: organizationId, contabil: true },
        select: {
          id: true,
          name: true,
          company_name: true,
          controlContabil: {
            where: { competence, organization_id: organizationId, archived_at: null },
            orderBy: { id: "asc" },
            take: 1,
          },
          triageClosings: {
            where: { competence, organization_id: organizationId, archived_at: null },
            orderBy: { id: "asc" },
            take: 1,
          },
        },
      });

      return {
        competence,
        items: clients
          .map((client) => ({
            client_id: client.id,
            legal_name: client.company_name?.trim() || client.name,
            control: client.controlContabil[0] ?? null,
            closing: client.triageClosings[0] ?? {
              client_id: client.id,
              competence,
              status: "NOT_RECEIVED",
              archived_at: null,
            },
          }))
          .sort((left, right) => left.legal_name.localeCompare(right.legal_name, "pt-BR")),
      };
    },
  };
}

export function createContabilWorkerApp(options: ContabilOptions = {}) {
  const app = new Hono<ContabilContext>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "contabil-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else {
      await withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) => {
        await client.$queryRaw`SELECT 1`;
      });
    }
    return c.json(createSuccessResponse({ status: "ready", service: "contabil-service" }));
  });

  app.use("/contabil/*", async (c, next) => {
    c.set("auth", await authenticateContabilRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/contabil", async (c, next) => {
    c.set("auth", await authenticateContabilRequest(c.req.raw, options.env ?? c.env));
    await next();
  });

  app.get("/contabil/controls/list", async (c) => {
    const auth = c.get("auth");
    const query = parseWithZod(listControlQuerySchema, c.req.query());
    const execute = async (service: ControlServiceLike) =>
      c.json(createSuccessResponse(await service.list(query.competence, auth.organizationId)));
    if (options.controlService) return execute(options.controlService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) =>
      execute(createControlService(client as unknown as ContabilPrisma)),
    );
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
