import {
  createGroupBodySchema,
  groupIdParamsSchema,
  updateGroupBodySchema,
} from "@workspace/pessoal-service/src/schemas/group.schemas.js";
import { NORMAL_GROUP_POLICY } from "@workspace/pessoal-service/src/services/pessoalGroupPolicy.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
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
import { authenticatePessoalRequest, requirePessoalPermission } from "./auth.js";
import type { PessoalWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type GroupRow = Record<string, unknown> & { organization_id: string };
export type PessoalGroupPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  pessoalGroup: {
    findMany(args: Record<string, unknown>): Promise<GroupRow[]>;
    findFirst(args: Record<string, unknown>): Promise<GroupRow | null>;
    create(args: Record<string, unknown>): Promise<GroupRow>;
    update(args: Record<string, unknown>): Promise<GroupRow>;
  };
};
export type PessoalGroupService = {
  list(organizationId: string): Promise<unknown>;
  detail(organizationId: string, id: string): Promise<unknown>;
  create(organizationId: string, userId: string, input: Record<string, unknown>): Promise<unknown>;
  update(
    organizationId: string,
    userId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  archive(organizationId: string, userId: string, id: string): Promise<unknown>;
  reactivate(organizationId: string, userId: string, id: string): Promise<unknown>;
};
type PessoalOptions = {
  env?: PessoalWorkerEnv;
  prisma?: PessoalGroupPrisma;
  groupService?: PessoalGroupService;
};
type PessoalWorkerContext = { Bindings: PessoalWorkerEnv; Variables: { auth: WorkerAuthContext } };
type PessoalContext = Context<PessoalWorkerContext>;

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function displayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function dto(row: GroupRow): Record<string, unknown> {
  const { organization_id: _organizationId, ...data } = row;
  return data;
}

async function audit(
  env: PessoalWorkerEnv | undefined,
  input: Record<string, unknown>,
): Promise<void> {
  if (!env?.AUDIT_SERVICE) return;
  try {
    await env.AUDIT_SERVICE.fetch(
      new Request("https://audit.internal/internal/audit/requests", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: env.INTERNAL_SERVICE_TOKEN,
        },
        body: JSON.stringify(input),
      }),
    );
  } catch {
    // Audit is best-effort here, matching the existing PessoalAuditService contract.
  }
}

function localService(prisma: PessoalGroupPrisma, env?: PessoalWorkerEnv): PessoalGroupService {
  const select = {
    id: true,
    name: true,
    policy: true,
    system_key: true,
    archived_at: true,
    organization_id: true,
  };
  return {
    list: async (organizationId) =>
      (
        await prisma.pessoalGroup.findMany({
          where: { organization_id: organizationId },
          orderBy: [{ archived_at: "asc" }, { name: "asc" }],
          select,
        })
      ).map(dto),
    async detail(organizationId, id) {
      const row = await prisma.pessoalGroup.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!row) throw new ServiceError(404, "Grupo de pessoal não encontrado.");
      return dto(row);
    },
    async create(organizationId, userId, input) {
      const name = displayName(String(input.name));
      const row = await prisma.pessoalGroup.create({
        data: {
          name,
          normalized_name: normalizeName(name),
          policy: input.policy ?? NORMAL_GROUP_POLICY,
          organization_id: organizationId,
        },
        select,
      });
      await audit(env, {
        requestId: crypto.randomUUID(),
        organizationId,
        userId,
        method: "ENTITY_CHANGE",
        statusCode: 201,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Cadastro",
        referring: "pessoal.group",
        referringId: row.id,
        changes: { name: row.name },
        department: "pessoal",
      });
      return dto(row);
    },
    async update(organizationId, userId, id, input) {
      const current = await prisma.pessoalGroup.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Grupo de pessoal não encontrado.");
      if (current.system_key === "NO_MOVEMENT")
        throw new ServiceError(409, "O grupo Sem Movimento não pode ser alterado.");
      const data = {
        ...(input.name
          ? {
              name: displayName(String(input.name)),
              normalized_name: normalizeName(String(input.name)),
            }
          : {}),
        ...(input.policy ? { policy: input.policy } : {}),
      };
      const row = await prisma.pessoalGroup.update({ where: { id }, data, select });
      await audit(env, {
        requestId: crypto.randomUUID(),
        organizationId,
        userId,
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: data,
        department: "pessoal",
      });
      return dto(row);
    },
    async archive(organizationId, userId, id) {
      const current = await prisma.pessoalGroup.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Grupo de pessoal não encontrado.");
      if (current.system_key === "NO_MOVEMENT")
        throw new ServiceError(409, "O grupo Sem Movimento não pode ser arquivado.");
      const row = await prisma.pessoalGroup.update({
        where: { id },
        data: { archived_at: new Date() },
        select,
      });
      await audit(env, {
        requestId: crypto.randomUUID(),
        organizationId,
        userId,
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: { archived_at: row.archived_at },
        department: "pessoal",
      });
      return dto(row);
    },
    async reactivate(organizationId, userId, id) {
      const current = await prisma.pessoalGroup.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Grupo de pessoal não encontrado.");
      const row = await prisma.pessoalGroup.update({
        where: { id },
        data: { archived_at: null },
        select,
      });
      await audit(env, {
        requestId: crypto.randomUUID(),
        organizationId,
        userId,
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.group",
        referringId: id,
        changes: { archived_at: null },
        department: "pessoal",
      });
      return dto(row);
    },
  };
}

export function createPessoalWorkerApp(options: PessoalOptions = {}) {
  const app = new Hono<PessoalWorkerContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "pessoal-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "pessoal-service" }));
  });
  app.use("/pessoal/*", async (c, next) => {
    c.set("auth", await authenticatePessoalRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/pessoal", async (c, next) => {
    c.set("auth", await authenticatePessoalRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalGroupService) => Promise<T>,
  ) => {
    if (options.groupService) return callback(options.groupService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as PessoalGroupPrisma, options.env ?? c.env)),
    );
  };
  app.get("/pessoal/groups", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      return c.json(createSuccessResponse(await service.list(c.get("auth").organizationId)));
    }),
  );
  app.get("/pessoal/groups/:id", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const { id } = parseWithZod(groupIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.post("/pessoal/groups", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createGroupBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.create(c.get("auth").organizationId, c.get("auth").userId, body),
        ),
        201,
      );
    }),
  );
  app.patch("/pessoal/groups/:id", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(groupIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateGroupBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.update(c.get("auth").organizationId, c.get("auth").userId, id, body),
        ),
      );
    }),
  );
  app.delete("/pessoal/groups/:id", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(groupIdParamsSchema, { id: c.req.param("id") });
      return c.json(
        createSuccessResponse(
          await service.archive(c.get("auth").organizationId, c.get("auth").userId, id),
        ),
      );
    }),
  );
  app.post("/pessoal/groups/:id/reactivate", (c) =>
    withService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(groupIdParamsSchema, { id: c.req.param("id") });
      return c.json(
        createSuccessResponse(
          await service.reactivate(c.get("auth").organizationId, c.get("auth").userId, id),
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
      fallbackMessage: "Erro interno no pessoal-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { PessoalWorkerEnv } from "./env.js";
