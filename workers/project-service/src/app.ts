import {
  integracaoProjectCreateBodySchema,
  integracaoProjectDetailQuerySchema,
  integracaoProjectListQuerySchema,
} from "@workspace/project-service/src/schemas/projectCrud.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, REQUEST_ID_HEADER, serializeError } from "@workspace/shared/http";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateProjectRequest } from "./auth.js";
import type { ProjectWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

export type { ProjectWorkerEnv } from "./env.js";

type ProjectRow = Record<string, unknown> & { organization_id: string };
type ProjectPrisma = {
  project: {
    findMany(args: Record<string, unknown>): Promise<ProjectRow[]>;
    findFirst(args: Record<string, unknown>): Promise<ProjectRow | null>;
    create(args: Record<string, unknown>): Promise<ProjectRow>;
  };
};
type ProjectService = {
  list(ref: "client" | "status" | "sponsor", id: string, organizationId: string): Promise<unknown>;
  detail(id: string, organizationId: string): Promise<unknown>;
  create(input: Record<string, unknown>): Promise<unknown>;
};
type ProjectContext = { Bindings: ProjectWorkerEnv; Variables: { auth: WorkerAuthContext } };
type ProjectOptions = { env?: ProjectWorkerEnv; projectService?: ProjectService };

function localService(prisma: ProjectPrisma): ProjectService {
  return {
    async list(ref, id, organizationId) {
      const field = ref === "client" ? "client_id" : ref === "sponsor" ? "sponsor_id" : "status";
      return prisma.project.findMany({
        where: { organization_id: organizationId, [field]: id },
        orderBy: { name: "asc" },
      });
    },
    async detail(id, organizationId) {
      const row = await prisma.project.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!row) throw new Error("Projeto não encontrado.");
      return { detail: row };
    },
    async create(input) {
      return {
        create: await prisma.project.create({
          data: { ...input, status: "Em andamento", porcentage: 0 },
        }),
      };
    },
  };
}

export function createProjectWorkerApp(options: ProjectOptions = {}) {
  const app = new Hono<ProjectContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "project-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "project-service" })),
  );
  app.use("/project", async (c, next) => {
    c.set("auth", await authenticateProjectRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/project/*", async (c, next) => {
    c.set("auth", await authenticateProjectRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const service = async (
    c: { env: ProjectWorkerEnv },
    callback: (value: ProjectService) => Promise<Response>,
  ) => {
    if (options.projectService) return callback(options.projectService);
    return withWorkerPrisma(c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as ProjectPrisma)),
    );
  };
  app.get("/project/list", (c) =>
    service(c, async (worker) => {
      const q = parseWithZod(integracaoProjectListQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await worker.list(q.ref, q.id, c.get("auth").organizationId)),
      );
    }),
  );
  app.get("/project", (c) =>
    service(c, async (worker) => {
      const q = parseWithZod(integracaoProjectDetailQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await worker.detail(q.project_id, c.get("auth").organizationId)),
      );
    }),
  );
  app.post("/project", (c) =>
    service(c, async (worker) => {
      const body = parseWithZod(integracaoProjectCreateBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await worker.create({
            ...body,
            organization_id: c.get("auth").organizationId,
            user_id: c.get("auth").userId,
          }),
        ),
        201,
      );
    }),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no project-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
