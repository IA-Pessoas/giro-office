import {
  type DepartmentPrismaDeps,
  DepartmentService,
} from "@workspace/department-service/src/services/departmentService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { zodIssueMessage } from "@workspace/shared/schemas";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { createDepartmentAudit } from "./audit.js";
import { authenticateDepartmentRequest, authorizeDepartmentRequest } from "./auth.js";
import type { DepartmentWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

const listQuerySchema = z
  .object({ status: z.enum(["Todos", "Ativo", "Inativo"]).optional() })
  .strict();
const createBodySchema = z
  .object({
    name: z.string().min(1, "name é obrigatório."),
    color: z.string().min(1, "color é obrigatório."),
    solution: z.boolean().optional(),
  })
  .strict();
const updateBodySchema = z
  .object({
    dep_id: z.string().min(1, "dep_id é obrigatório."),
    name: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    status: z.enum(["Ativo", "Inativo"]).optional(),
    solution: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.color !== undefined ||
      data.status !== undefined ||
      data.solution !== undefined,
    { message: "Informe ao menos um campo para atualizar (name, color, status ou solution)." },
  );

type DepartmentUpdateStatus = "Ativo" | "Inativo";

function parseDetailQuery(url: URL): { dep_id: string } {
  const depId = url.searchParams.get("dep_id") ?? undefined;
  if (!depId) throw new ServiceError(400, "dep_id é obrigatório.");
  return { dep_id: depId };
}

function parseCreateBody(input: unknown): { name: string; color: string; solution?: boolean } {
  return parseWorkerWithZod(createBodySchema, input);
}

function parseUpdateBody(input: unknown): {
  dep_id: string;
  name?: string;
  color?: string;
  status?: DepartmentUpdateStatus;
  solution?: boolean;
} {
  return parseWorkerWithZod(updateBodySchema, input);
}

function parseWorkerWithZod<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError(400, zodIssueMessage(parsed.error));
  }
  return parsed.data;
}

type DepartmentServiceLike = Pick<DepartmentService, "create" | "detail" | "list" | "update">;

interface DepartmentWorkerOptions {
  env?: DepartmentWorkerEnv;
  departmentService?: DepartmentServiceLike;
}

type WorkerVariables = { auth: WorkerAuthContext };
type DepartmentContext = Context<{ Bindings: DepartmentWorkerEnv; Variables: WorkerVariables }>;

export function createDepartmentWorkerApp(options: DepartmentWorkerOptions = {}) {
  const app = new Hono<{ Bindings: DepartmentWorkerEnv; Variables: WorkerVariables }>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "department-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "department-service" })),
  );

  app.use("/department/*", async (c, next) => {
    const auth = await authenticateDepartmentRequest(c.req.raw, options.env ?? c.env);
    authorizeDepartmentRequest(c.req.raw, auth);
    c.set("auth", auth);
    await next();
  });
  app.use("/department", async (c, next) => {
    const auth = await authenticateDepartmentRequest(c.req.raw, options.env ?? c.env);
    authorizeDepartmentRequest(c.req.raw, auth);
    c.set("auth", auth);
    await next();
  });

  const withService = async <T>(
    c: DepartmentContext,
    callback: (service: DepartmentServiceLike) => Promise<T>,
  ) => {
    if (options.departmentService) return callback(options.departmentService);
    const env = options.env ?? c.env;
    return withWorkerPrisma(env, PrismaClient, async (client) => {
      const service = new DepartmentService(
        {
          department: (client as unknown as { department: DepartmentPrismaDeps["department"] })
            .department,
        },
        createDepartmentAudit(env),
      );
      return callback(service);
    });
  };

  app.get("/department/list", async (c) =>
    withService(c, async (service) => {
      const auth = c.get("auth");
      const query = parseWorkerWithZod(listQuerySchema, {
        status: new URL(c.req.url).searchParams.get("status") ?? undefined,
      });
      const data = await service.list(query.status, auth.organizationId);
      return c.json(createSuccessResponse(data));
    }),
  );

  app.get("/department", async (c) =>
    withService(c, async (service) => {
      const auth = c.get("auth");
      const { dep_id } = parseDetailQuery(new URL(c.req.url));
      const data = await service.detail(dep_id, auth.organizationId);
      return c.json(createSuccessResponse(data));
    }),
  );

  app.post("/department", async (c) =>
    withService(c, async (service) => {
      const auth = c.get("auth");
      const data = parseCreateBody(await readJson(c));
      const result = await service.create({
        user_id: auth.userId,
        organization_id: auth.organizationId,
        ...data,
      });
      return c.json(createSuccessResponse(result), 201);
    }),
  );

  app.put("/department", async (c) =>
    withService(c, async (service) => {
      const auth = c.get("auth");
      const data = parseUpdateBody(await readJson(c));
      const result = await service.update({
        user_id: auth.userId,
        organization_id: auth.organizationId,
        ...data,
      });
      return c.json(createSuccessResponse(result));
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no department-service.",
    });
    if (serialized.statusCode === 409) c.header("x-auth-session-state", "superseded");
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}

async function readJson(c: { req: { json: <T>() => Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}
