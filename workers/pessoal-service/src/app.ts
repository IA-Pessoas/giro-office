import {
  createGroupBodySchema,
  groupIdParamsSchema,
  updateGroupBodySchema,
} from "@workspace/pessoal-service/src/schemas/group.schemas.js";
import {
  createLddBodySchema,
  lddIdParamsSchema,
  listLddQuerySchema,
  updateLddBodySchema,
} from "@workspace/pessoal-service/src/schemas/ldd.schemas.js";
import {
  createSituationBodySchema,
  listSituationQuerySchema,
  situationIdParamsSchema,
  updateSituationBodySchema,
} from "@workspace/pessoal-service/src/schemas/situation.schemas.js";
import {
  createUnionBodySchema,
  listUnionsQuerySchema,
  unionIdParamsSchema,
  updateUnionBodySchema,
} from "@workspace/pessoal-service/src/schemas/union.schemas.js";
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
export type PessoalUnionService = {
  list(context: { organizationId: string }, query: Record<string, unknown>): Promise<unknown>;
  detail(context: { organizationId: string }, id: string): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  update(
    context: Record<string, unknown>,
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  delete(context: Record<string, unknown>, id: string): Promise<unknown>;
};
export type PessoalSituationService = {
  list(context: { organizationId: string }, query: Record<string, unknown>): Promise<unknown>;
  detail(context: { organizationId: string }, id: string): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  update(
    context: Record<string, unknown>,
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  delete(context: Record<string, unknown>, id: string): Promise<unknown>;
};
export type PessoalLddService = {
  list(context: { organizationId: string }, query: Record<string, unknown>): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  update(
    context: Record<string, unknown>,
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  delete(context: Record<string, unknown>, id: string): Promise<unknown>;
};
export type PessoalDomainPrisma = PessoalGroupPrisma & {
  unionPessoal: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    count(args: Record<string, unknown>): Promise<number>;
  };
  payroll: { count(args: Record<string, unknown>): Promise<number> };
  client: { findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null> };
  situationsPessoal: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  lddPessoal: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
};
type PessoalOptions = {
  env?: PessoalWorkerEnv;
  prisma?: PessoalDomainPrisma;
  groupService?: PessoalGroupService;
  unionService?: PessoalUnionService;
  situationService?: PessoalSituationService;
  lddService?: PessoalLddService;
};
type PessoalWorkerContext = { Bindings: PessoalWorkerEnv; Variables: { auth: WorkerAuthContext } };
type PessoalContext = Context<PessoalWorkerContext>;

function domainContext(c: PessoalContext): Record<string, unknown> {
  const auth = c.get("auth");
  return {
    organizationId: auth.organizationId,
    userId: auth.userId,
    permission: Number(auth.claims.permission ?? 0),
    ...(c.req.header(REQUEST_ID_HEADER) ? { requestId: c.req.header(REQUEST_ID_HEADER) } : {}),
  };
}

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

function localUnionService(
  prisma: PessoalDomainPrisma,
  env?: PessoalWorkerEnv,
): PessoalUnionService {
  const select = { id: true, name: true, cnpj: true, base_date: true, organization_id: true };
  return {
    async list(context, query) {
      const where = {
        organization_id: context.organizationId,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { cnpj: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const args = {
        where,
        select,
        orderBy: { name: "asc" },
        ...(query.paginationRequested
          ? { skip: (Number(query.page) - 1) * Number(query.limit), take: Number(query.limit) }
          : {}),
      };
      const data = await prisma.unionPessoal.findMany(args);
      if (!query.paginationRequested) return data;
      const total = await prisma.unionPessoal.count({ where });
      return {
        data,
        total,
        page: Number(query.page),
        limit: Number(query.limit),
        hasMore: Number(query.page) * Number(query.limit) < total,
      };
    },
    async detail(context, id) {
      const row = await prisma.unionPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select,
      });
      if (!row) throw new ServiceError(404, "Sindicato nao encontrado.");
      return row;
    },
    async create(context, body) {
      const organizationId = String(context.organizationId);
      const existing = await prisma.unionPessoal.findFirst({
        where: {
          organization_id: organizationId,
          name: body.name,
          cnpj: body.cnpj,
          base_date: body.base_date ?? null,
        },
        select: { id: true },
      });
      if (existing) throw new ServiceError(409, "Sindicato ja cadastrado.");
      const row = await prisma.unionPessoal.create({
        data: {
          name: body.name,
          cnpj: body.cnpj,
          base_date: body.base_date ?? null,
          organization_id: organizationId,
        },
        select,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 201,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Cadastro",
        referring: "pessoal.union",
        referringId: String(row.id),
        department: "pessoal",
      });
      return row;
    },
    async update(context, id, body) {
      const organizationId = String(context.organizationId);
      const current = await prisma.unionPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Sindicato nao encontrado.");
      const data = {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.cnpj !== undefined ? { cnpj: body.cnpj } : {}),
        ...(body.base_date !== undefined ? { base_date: body.base_date } : {}),
      };
      const duplicate = await prisma.unionPessoal.findFirst({
        where: {
          organization_id: organizationId,
          name: body.name ?? current.name,
          cnpj: body.cnpj ?? current.cnpj,
          base_date: body.base_date !== undefined ? body.base_date : current.base_date,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Sindicato ja cadastrado.");
      const row = await prisma.unionPessoal.update({ where: { id }, data, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.union",
        referringId: id,
        department: "pessoal",
      });
      return row;
    },
    async delete(context, id) {
      const organizationId = String(context.organizationId);
      const current = await prisma.unionPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Sindicato nao encontrado.");
      if (
        (await prisma.payroll.count({ where: { organization_id: organizationId, union_id: id } })) >
        0
      ) {
        throw new ServiceError(
          409,
          "Nao e possivel remover o sindicato porque ele esta vinculado a uma ou mais configuracoes de folha.",
        );
      }
      const row = await prisma.unionPessoal.delete({ where: { id }, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Exclusao",
        referring: "pessoal.union",
        referringId: id,
        department: "pessoal",
      });
      return row;
    },
  };
}

function localSituationService(
  prisma: PessoalDomainPrisma,
  env?: PessoalWorkerEnv,
): PessoalSituationService {
  const select = {
    id: true,
    client_id: true,
    status: true,
    title: true,
    description: true,
    registration_date: true,
    completion_date: true,
    registered_by_id: true,
    completed_by_id: true,
    organization_id: true,
  };
  return {
    list: (context, query) =>
      prisma.situationsPessoal.findMany({
        where: { organization_id: context.organizationId, client_id: query.client_id },
        select,
        orderBy: { registration_date: "desc" },
      }),
    async detail(context, id) {
      const row = await prisma.situationsPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select,
      });
      if (!row) throw new ServiceError(404, "Situacao nao encontrada.");
      return row;
    },
    async create(context, body) {
      const organizationId = String(context.organizationId);
      const client = await prisma.client.findFirst({
        where: { id: body.client_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
      const row = await prisma.situationsPessoal.create({
        data: {
          client_id: body.client_id,
          status: "Em andamento",
          title: body.title,
          description: body.description,
          registered_by_id: String(context.userId),
          organization_id: organizationId,
        },
        select,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 201,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Cadastro",
        referring: "pessoal.situations",
        referringId: String(row.id),
        department: "pessoal",
      });
      return row;
    },
    async update(context, id, body) {
      const organizationId = String(context.organizationId);
      const current = await prisma.situationsPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Situacao nao encontrada.");
      const data = {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status === "Finalizado"
          ? { completed_by_id: String(context.userId), completion_date: new Date() }
          : body.status === "Em andamento"
            ? { completed_by_id: null, completion_date: null }
            : {}),
      };
      const row = await prisma.situationsPessoal.update({ where: { id }, data, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.situations",
        referringId: id,
        department: "pessoal",
      });
      return row;
    },
    async delete(context, id) {
      const organizationId = String(context.organizationId);
      const current = await prisma.situationsPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "Situacao nao encontrada.");
      const row = await prisma.situationsPessoal.delete({ where: { id }, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Exclusao",
        referring: "pessoal.situations",
        referringId: id,
        department: "pessoal",
      });
      return row;
    },
  };
}

function localLddService(prisma: PessoalDomainPrisma, env?: PessoalWorkerEnv): PessoalLddService {
  const select = {
    id: true,
    client_id: true,
    type: true,
    period: true,
    due_date: true,
    balance_amount: true,
    registration_status: true,
    status: true,
    organization_id: true,
  };
  return {
    list: (context, query) =>
      prisma.lddPessoal.findMany({
        where: {
          organization_id: context.organizationId,
          ...(query.client_id ? { client_id: query.client_id } : {}),
        },
        select,
        orderBy: { due_date: "asc" },
      }),
    async create(context, body) {
      const organizationId = String(context.organizationId);
      const client = await prisma.client.findFirst({
        where: { id: body.client_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
      const row = await prisma.lddPessoal.create({
        data: {
          client_id: body.client_id,
          type: body.type,
          period: body.period ?? null,
          due_date: body.due_date ?? null,
          balance_amount: body.balance_amount ?? null,
          registration_status: body.registration_status ?? null,
          status: body.status ?? null,
          organization_id: organizationId,
        },
        select,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 201,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Cadastro",
        referring: "pessoal.ldd",
        referringId: String(row.id),
        department: "pessoal",
      });
      return row;
    },
    async update(context, id, body) {
      const organizationId = String(context.organizationId);
      const current = await prisma.lddPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "LDD nao encontrado.");
      const data = {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.period !== undefined ? { period: body.period } : {}),
        ...(body.due_date !== undefined ? { due_date: body.due_date } : {}),
        ...(body.balance_amount !== undefined ? { balance_amount: body.balance_amount } : {}),
        ...(body.registration_status !== undefined
          ? { registration_status: body.registration_status }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      };
      const row = await prisma.lddPessoal.update({ where: { id }, data, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.ldd",
        referringId: id,
        department: "pessoal",
      });
      return row;
    },
    async delete(context, id) {
      const organizationId = String(context.organizationId);
      const current = await prisma.lddPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!current) throw new ServiceError(404, "LDD nao encontrado.");
      const row = await prisma.lddPessoal.delete({ where: { id }, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Exclusao",
        referring: "pessoal.ldd",
        referringId: id,
        department: "pessoal",
      });
      return row;
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
  const withUnionService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalUnionService) => Promise<T>,
  ) => {
    if (options.unionService) return callback(options.unionService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localUnionService(client as unknown as PessoalDomainPrisma, options.env ?? c.env)),
    );
  };
  const withSituationService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalSituationService) => Promise<T>,
  ) => {
    if (options.situationService) return callback(options.situationService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(
        localSituationService(client as unknown as PessoalDomainPrisma, options.env ?? c.env),
      ),
    );
  };
  const withLddService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalLddService) => Promise<T>,
  ) => {
    if (options.lddService) return callback(options.lddService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localLddService(client as unknown as PessoalDomainPrisma, options.env ?? c.env)),
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
  app.get("/pessoal/unions", (c) =>
    withUnionService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(listUnionsQuerySchema, c.req.query());
      const url = new URL(c.req.url);
      return c.json(
        createSuccessResponse(
          await service.list(
            { organizationId: c.get("auth").organizationId },
            {
              ...query,
              paginationRequested: url.searchParams.has("page") || url.searchParams.has("limit"),
            },
          ),
        ),
      );
    }),
  );
  app.get("/pessoal/unions/:id", (c) =>
    withUnionService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const { id } = parseWithZod(unionIdParamsSchema, { id: c.req.param("id") });
      return c.json(
        createSuccessResponse(
          await service.detail({ organizationId: c.get("auth").organizationId }, id),
        ),
      );
    }),
  );
  app.post("/pessoal/unions", (c) =>
    withUnionService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createUnionBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.create(domainContext(c), body)), 201);
    }),
  );
  app.patch("/pessoal/unions/:id", (c) =>
    withUnionService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(unionIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateUnionBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.update(domainContext(c), id, body)));
    }),
  );
  app.delete("/pessoal/unions/:id", (c) =>
    withUnionService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(unionIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.delete(domainContext(c), id)));
    }),
  );
  app.get("/pessoal/situations", (c) =>
    withSituationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(listSituationQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list({ organizationId: c.get("auth").organizationId }, query),
        ),
      );
    }),
  );
  app.get("/pessoal/situations/:id", (c) =>
    withSituationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const { id } = parseWithZod(situationIdParamsSchema, { id: c.req.param("id") });
      return c.json(
        createSuccessResponse(
          await service.detail({ organizationId: c.get("auth").organizationId }, id),
        ),
      );
    }),
  );
  app.post("/pessoal/situations", (c) =>
    withSituationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createSituationBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.create(domainContext(c), body)), 201);
    }),
  );
  app.patch("/pessoal/situations/:id", (c) =>
    withSituationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(situationIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateSituationBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.update(domainContext(c), id, body)));
    }),
  );
  app.delete("/pessoal/situations/:id", (c) =>
    withSituationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(situationIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.delete(domainContext(c), id)));
    }),
  );
  app.get("/pessoal/ldd", (c) =>
    withLddService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(listLddQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list({ organizationId: c.get("auth").organizationId }, query),
        ),
      );
    }),
  );
  app.post("/pessoal/ldd", (c) =>
    withLddService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createLddBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.create(domainContext(c), body)), 201);
    }),
  );
  app.patch("/pessoal/ldd/:id", (c) =>
    withLddService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(lddIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateLddBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.update(domainContext(c), id, body)));
    }),
  );
  app.delete("/pessoal/ldd/:id", (c) =>
    withLddService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(lddIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.delete(domainContext(c), id)));
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
