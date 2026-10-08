import { withWorkerPrisma } from "@workspace/runtime";
import type { ForwardedAuditAuthContext } from "@workspace/shared/audit";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";

import { assertAuditAdmin, assertAuditSearchAdmin, authenticateAuditRequest } from "./auth.js";
import { type AuditWorkerEnv, auditEnabled } from "./env.js";
import { PrismaClient } from "./prisma.js";
import { type AuditRequestRepository, createAuditRequestRepository } from "./repository.js";
import { createAuditRequestService } from "./service.js";

interface AuditWorkerOptions {
  env?: AuditWorkerEnv;
  repository?: AuditRequestRepository;
}

type AuditWorkerVariables = { auth: ForwardedAuditAuthContext };
type AuditContext = Context<{ Bindings: AuditWorkerEnv; Variables: AuditWorkerVariables }>;

function queryObject(url: URL): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const current = query[key];
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return query;
}

function jsonError(error: unknown, request: Request): Response {
  const serialized = serializeError(error, {
    requestId: request.headers.get(REQUEST_ID_HEADER) ?? undefined,
    fallbackMessage: "Erro interno no serviço de auditoria.",
  });
  return new Response(JSON.stringify(serialized.body), {
    status: serialized.statusCode,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}

export function createAuditWorkerApp(options: AuditWorkerOptions = {}) {
  const app = new Hono<{ Bindings: AuditWorkerEnv; Variables: AuditWorkerVariables }>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "audit-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "audit-service" })),
  );

  app.use("/audit/*", async (c, next) => {
    const env = options.env ?? c.env;
    if (!auditEnabled(env)) throw new ServiceError(404, "Recurso não encontrado.");
    c.set("auth", await authenticateAuditRequest(c.req.raw, env));
    await next();
  });
  app.use("/audit", async (c, next) => {
    const env = options.env ?? c.env;
    if (!auditEnabled(env)) throw new ServiceError(404, "Recurso não encontrado.");
    c.set("auth", await authenticateAuditRequest(c.req.raw, env));
    await next();
  });
  app.use("/internal/*", async (c, next) => {
    const env = options.env ?? c.env;
    if (!auditEnabled(env)) throw new ServiceError(404, "Recurso não encontrado.");
    if (c.req.header("x-internal-service-token") !== env.INTERNAL_SERVICE_TOKEN) {
      throw new ServiceError(401, "Não autenticado.");
    }
    await next();
  });

  const withService = async <T>(
    c: AuditContext,
    callback: (service: ReturnType<typeof createAuditRequestService>) => Promise<T>,
  ): Promise<T> => {
    const env = options.env ?? c.env;
    if (options.repository) return callback(createAuditRequestService(options.repository));
    return withWorkerPrisma(env, PrismaClient, async (client) =>
      callback(createAuditRequestService(createAuditRequestRepository(client as never))),
    );
  };

  app.post("/internal/audit/requests", async (c) => {
    const body = await c.req.json<unknown>();
    const requestId = await withService(c, (service) => service.create(body));
    return c.json(createSuccessResponse({ requestId }), 201);
  });

  app.get("/audit/requests", async (c) => {
    const auth = c.get("auth");
    assertAuditSearchAdmin(auth);
    const query = queryObject(new URL(c.req.url));
    const result =
      auth.authKind === "platform"
        ? await withService(c, (service) => service.searchPlatform(query))
        : await withService(c, (service) => {
            if (!auth.organizationId) throw new ServiceError(403, "Acesso negado para esta rota.");
            return service.search(query, auth.organizationId);
          });
    return c.json(createSuccessResponse(result));
  });

  app.get("/audit/requests/:requestId", async (c) => {
    const auth = c.get("auth");
    assertAuditAdmin(auth);
    if (!auth.organizationId) throw new ServiceError(403, "Acesso negado para esta rota.");
    const item = await withService(c, (service) =>
      service.findByRequestId(c.req.param("requestId"), auth.organizationId as string),
    );
    if (!item) throw new ServiceError(404, "Registro de auditoria não encontrado.");
    return c.json(createSuccessResponse({ item }));
  });

  app.notFound(() =>
    jsonError(new ServiceError(404, "Recurso não encontrado."), new Request("http://worker")),
  );
  app.onError((error, c) => jsonError(error, c.req.raw));
  return app;
}

export type { AuditWorkerEnv } from "./env.js";
