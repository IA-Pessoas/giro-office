import {
  createIcmsBodySchema,
  deleteIcmsQuerySchema,
  detailIcmsQuerySchema,
  listIcmsQuerySchema,
  updateIcmsBodySchema,
} from "@workspace/fiscal-service/src/schemas/icms.schemas.js";
import { IcmsService } from "@workspace/fiscal-service/src/services/icmsService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createFiscalAudit } from "./audit.js";
import { authenticateFiscalRequest, authorizeFiscalRequest } from "./auth.js";
import type { FiscalWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type IcmsServiceLike = Pick<IcmsService, "create" | "update" | "delete" | "detail" | "list">;

interface FiscalWorkerOptions {
  env: FiscalWorkerEnv;
  icmsService?: IcmsServiceLike;
}

type FiscalWorkerVariables = { auth: WorkerAuthContext };
type FiscalContext = { Bindings: FiscalWorkerEnv; Variables: FiscalWorkerVariables };

function parseDetailQuery(c: { req: { query: (key: string) => string | undefined } }) {
  return parseWithZod(detailIcmsQuerySchema, { icms_id: c.req.query("icms_id") });
}

function parseDeleteQuery(c: { req: { query: (key: string) => string | undefined } }) {
  return parseWithZod(deleteIcmsQuerySchema, { icms_id: c.req.query("icms_id") });
}

function parseListQuery(c: { req: { url: string } }) {
  const url = new URL(c.req.url);
  const icmsCodes = url.searchParams.getAll("icmsCodes");
  return parseWithZod(listIcmsQuerySchema, {
    icmsCodes: icmsCodes.length > 0 ? icmsCodes : undefined,
    page: url.searchParams.get("page") ?? undefined,
    page_size: url.searchParams.get("page_size") ?? undefined,
  });
}

async function readJson(c: { req: { json: <T>() => Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}

export function createFiscalWorkerApp(options: FiscalWorkerOptions) {
  const app = new Hono<FiscalContext>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "fiscal-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "fiscal-service" })),
  );

  const authenticate: MiddlewareHandler<FiscalContext> = async (c, next) => {
    const auth = await authenticateFiscalRequest(c.req.raw, options.env);
    authorizeFiscalRequest(c.req.raw, auth);
    c.set("auth", auth);
    await next();
  };

  app.use("/fiscal", authenticate);
  app.use("/fiscal/*", authenticate);

  const withService = async <T>(callback: (service: IcmsServiceLike) => Promise<T>): Promise<T> => {
    if (options.icmsService) return callback(options.icmsService);
    return withWorkerPrisma(options.env, PrismaClient, async (client) => {
      const service = new IcmsService(
        client as unknown as ConstructorParameters<typeof IcmsService>[0],
        createFiscalAudit(options.env),
      );
      return callback(service);
    });
  };

  app.get("/fiscal/icms", async (c) =>
    withService(async (service) => {
      const auth = c.get("auth");
      const query = parseDetailQuery(c);
      return c.json(
        createSuccessResponse(await service.detail(query.icms_id, auth.organizationId)),
      );
    }),
  );

  app.get("/fiscal/icms/list", async (c) =>
    withService(async (service) => {
      const auth = c.get("auth");
      const query = parseListQuery(c);
      return c.json(createSuccessResponse(await service.list(query, auth.organizationId)));
    }),
  );

  app.post("/fiscal/icms", async (c) =>
    withService(async (service) => {
      const auth = c.get("auth");
      const body = parseWithZod(createIcmsBodySchema, await readJson(c));
      return c.json(
        createSuccessResponse(
          await service.create({
            userId: auth.userId,
            organizationId: auth.organizationId,
            permission: auth.claims.permission,
            ...body,
          }),
        ),
        201,
      );
    }),
  );

  app.put("/fiscal/icms", async (c) =>
    withService(async (service) => {
      const auth = c.get("auth");
      const body = parseWithZod(updateIcmsBodySchema, await readJson(c));
      return c.json(
        createSuccessResponse(
          await service.update({
            userId: auth.userId,
            organizationId: auth.organizationId,
            permission: auth.claims.permission,
            ...body,
          }),
        ),
      );
    }),
  );

  app.delete("/fiscal/icms", async (c) =>
    withService(async (service) => {
      const auth = c.get("auth");
      const query = parseDeleteQuery(c);
      return c.json(
        createSuccessResponse(
          await service.delete({
            userId: auth.userId,
            organizationId: auth.organizationId,
            permission: auth.claims.permission,
            icms_id: query.icms_id,
          }),
        ),
      );
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no fiscal-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
