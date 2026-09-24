import { InternalReportingService } from "@workspace/pessoal-service/src/reporting/internalReportingService.js";
import {
  createGroupBodySchema,
  groupIdParamsSchema,
  updateGroupBodySchema,
} from "@workspace/pessoal-service/src/schemas/group.schemas.js";
import {
  applyGroupAssignmentPreviewBodySchema,
  createGroupAssignmentPreviewBodySchema,
  groupAssignmentEligibleQuerySchema,
  groupAssignmentIdempotencyKeySchema,
  groupAssignmentPreviewParamsSchema,
  groupAssignmentPreviewQuerySchema,
} from "@workspace/pessoal-service/src/schemas/groupAssignment.schemas.js";
import {
  createLddBodySchema,
  lddIdParamsSchema,
  listLddQuerySchema,
  updateLddBodySchema,
} from "@workspace/pessoal-service/src/schemas/ldd.schemas.js";
import {
  createObligationBodySchema,
  detailObligationQuerySchema,
  generateObligationsParamsSchema,
  obligationIdParamsSchema,
  updateObligationFieldBodySchema,
} from "@workspace/pessoal-service/src/schemas/obligation.schemas.js";
import {
  createPasswordBodySchema,
  listPasswordsQuerySchema,
  passwordIdParamsSchema,
  updatePasswordBodySchema,
} from "@workspace/pessoal-service/src/schemas/password.schemas.js";
import {
  createPayrollBodySchema,
  payrollClientParamsSchema,
  updatePayrollBodySchema,
} from "@workspace/pessoal-service/src/schemas/payroll.schemas.js";
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
import {
  NO_OBLIGATIONS_GROUP_POLICY,
  NORMAL_GROUP_POLICY,
} from "@workspace/pessoal-service/src/services/pessoalGroupPolicy.js";
import {
  createPessoalPasswordCrypto,
  isPessoalPasswordEncrypted,
} from "@workspace/pessoal-service/src/services/pessoalPasswordCrypto.js";
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
import {
  createPessoalAuditRecorder,
  GroupAssignmentService,
  type PessoalAssignmentPrisma,
  type PessoalNotificationPrisma,
  sendPessoalAudit,
  UnionNotificationService,
} from "./remainderServices.js";
import { type PessoalReportingService, registerReportingRoutes } from "./reporting.js";

const DOMAIN_TRANSACTION_MAX_WAIT_MS = 5_000;
const DOMAIN_TRANSACTION_TIMEOUT_MS = 15_000;

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
export type PessoalPasswordService = {
  list(context: { organizationId: string }, query: Record<string, unknown>): Promise<unknown>;
  detail(context: Record<string, unknown>, id: string): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  update(
    context: Record<string, unknown>,
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  delete(context: Record<string, unknown>, id: string): Promise<unknown>;
};
export type PessoalPayrollService = {
  detail(context: { organizationId: string }, clientId: string): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  update(
    context: Record<string, unknown>,
    clientId: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
};
export type PessoalObligationService = {
  detail(context: { organizationId: string }, query: Record<string, unknown>): Promise<unknown>;
  create(context: Record<string, unknown>, body: Record<string, unknown>): Promise<unknown>;
  updateField(
    context: Record<string, unknown>,
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  generateForCompetence(context: Record<string, unknown>, competence: string): Promise<unknown>;
};
export type PessoalOverviewService = {
  getSummary(context: { organizationId: string }): Promise<unknown>;
};
export type PessoalDomainPrisma = PessoalGroupPrisma &
  PessoalAssignmentPrisma &
  PessoalNotificationPrisma & {
    unionPessoal: {
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      count(args: Record<string, unknown>): Promise<number>;
    };
    payroll: {
      count(args: Record<string, unknown>): Promise<number>;
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    client: {
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
    };
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
    passwordPessoal: {
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    user: {
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    };
    obrigationsPessoal: {
      count(args: Record<string, unknown>): Promise<number>;
      findMany(args: Record<string, unknown>): Promise<unknown[]>;
      findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
      create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
      createMany(args: Record<string, unknown>): Promise<{ count: number }>;
    };
  };
type PessoalOptions = {
  env?: PessoalWorkerEnv;
  prisma?: PessoalDomainPrisma;
  groupService?: PessoalGroupService;
  unionService?: PessoalUnionService;
  situationService?: PessoalSituationService;
  lddService?: PessoalLddService;
  passwordService?: PessoalPasswordService;
  payrollService?: PessoalPayrollService;
  obligationService?: PessoalObligationService;
  overviewService?: PessoalOverviewService;
  groupAssignmentService?: GroupAssignmentService;
  unionNotificationService?: UnionNotificationService;
  reportingService?: PessoalReportingService;
};
type PessoalWorkerContext = { Bindings: PessoalWorkerEnv; Variables: { auth: WorkerAuthContext } };
type PessoalContext = Context<PessoalWorkerContext>;

function domainContext(c: PessoalContext): {
  organizationId: string;
  userId: string;
  permission: number;
  requestId?: string;
} {
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
  await sendPessoalAudit(env, input);
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

function localPasswordService(
  prisma: PessoalDomainPrisma,
  env?: PessoalWorkerEnv,
): PessoalPasswordService {
  const secretFields = ["login_main", "senha_main", "login_secondary", "senha_secondary"] as const;
  const listSelect = {
    id: true,
    client_id: true,
    service_name: true,
    responsavel_id: true,
  };
  const detailSelect = {
    ...listSelect,
    login_main: true,
    senha_main: true,
    login_secondary: true,
    senha_secondary: true,
    notes: true,
    organization_id: true,
  };
  const crypto = env?.PESSOAL_PASSWORD_ENCRYPTION_KEY
    ? createPessoalPasswordCrypto({
        keyBase64: env.PESSOAL_PASSWORD_ENCRYPTION_KEY,
        keyVersion: env.PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION ?? "v1",
      })
    : undefined;
  const requireCrypto = () => {
    if (!crypto) throw new ServiceError(500, "Criptografia de senha de pessoal nao configurada.");
    return crypto;
  };
  const secretValue = (value: unknown): string | null =>
    value === null || value === undefined ? null : String(value);
  const responsible = async (id: unknown) => {
    if (!id) return null;
    const row = await prisma.user.findFirst({
      where: { id: String(id) },
      select: { id: true, name: true, full_name: true },
    });
    return row ?? null;
  };
  const listRecord = async (row: Record<string, unknown>) => ({
    id: row.id,
    client_id: row.client_id,
    service_name: row.service_name,
    responsavel_id: row.responsavel_id ?? null,
    responsavel: await responsible(row.responsavel_id),
  });

  return {
    async list(context, query) {
      const rows = (await prisma.passwordPessoal.findMany({
        where: { organization_id: context.organizationId, client_id: query.client_id },
        select: listSelect,
        orderBy: { service_name: "asc" },
      })) as Record<string, unknown>[];
      return Promise.all(rows.map(listRecord));
    },
    async detail(context, id) {
      let row = await prisma.passwordPessoal.findFirst({
        where: { id, organization_id: context.organizationId },
        select: detailSelect,
      });
      if (!row) throw new ServiceError(404, "Senha de pessoal nao encontrada.");
      if (Number(context.permission ?? 0) < 3) return listRecord(row);

      const passwordCrypto = requireCrypto();
      const legacyData: Record<string, string | null> = {};
      for (const field of secretFields) {
        const value = secretValue(row[field]);
        if (value !== null && !isPessoalPasswordEncrypted(value)) {
          legacyData[field] = passwordCrypto.encrypt(value);
        }
      }
      if (Object.keys(legacyData).length > 0) {
        row = await prisma.passwordPessoal.update({
          where: { id },
          data: legacyData,
          select: detailSelect,
        });
      }
      const output: Record<string, unknown> = {
        ...(await listRecord(row)),
        notes: row.notes ?? null,
        organization_id: row.organization_id,
      };
      for (const field of secretFields) {
        output[field] = passwordCrypto.decrypt(secretValue(row[field]));
      }
      await audit(env, {
        organizationId: String(context.organizationId),
        userId: String(context.userId),
        method: "ENTITY_READ",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Visualizacao",
        referring: "pessoal.passwords",
        referringId: id,
        changes: { revealedSecretFields: secretFields.filter((field) => output[field] !== null) },
        department: "pessoal",
      });
      return output;
    },
    async create(context, body) {
      const passwordCrypto = requireCrypto();
      const organizationId = String(context.organizationId);
      const client = await prisma.client.findFirst({
        where: { id: body.client_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
      if (body.responsavel_id) {
        const user = await prisma.user.findFirst({
          where: { id: body.responsavel_id, organization_id: organizationId },
          select: { id: true },
        });
        if (!user)
          throw new ServiceError(404, "Responsavel nao encontrado ou inelegivel para Pessoal.");
      }
      const data = {
        client_id: body.client_id,
        service_name: body.service_name,
        login_main: passwordCrypto.encrypt(secretValue(body.login_main)),
        senha_main: passwordCrypto.encrypt(secretValue(body.senha_main)),
        login_secondary: passwordCrypto.encrypt(secretValue(body.login_secondary)),
        senha_secondary: passwordCrypto.encrypt(secretValue(body.senha_secondary)),
        responsavel_id: body.responsavel_id ?? null,
        notes: body.notes ?? null,
        organization_id: organizationId,
      };
      const row = await prisma.passwordPessoal.create({
        data,
        select: listSelect,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 201,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Cadastro",
        referring: "pessoal.passwords",
        referringId: String(row.id),
        department: "pessoal",
      });
      return listRecord(row);
    },
    async update(context, id, body) {
      const passwordCrypto = requireCrypto();
      const organizationId = String(context.organizationId);
      const current = await prisma.passwordPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select: detailSelect,
      });
      if (!current) throw new ServiceError(404, "Senha de pessoal nao encontrada.");
      if (body.responsavel_id) {
        const user = await prisma.user.findFirst({
          where: { id: body.responsavel_id, organization_id: organizationId },
          select: { id: true },
        });
        if (!user)
          throw new ServiceError(404, "Responsavel nao encontrado ou inelegivel para Pessoal.");
      }
      const data: Record<string, unknown> = {};
      for (const field of ["service_name", "responsavel_id", "notes"] as const) {
        if (body[field] !== undefined) data[field] = body[field];
      }
      for (const field of secretFields) {
        if (body[field] !== undefined)
          data[field] = passwordCrypto.encrypt(secretValue(body[field]));
      }
      const row = await prisma.passwordPessoal.update({
        where: { id },
        data,
        select: listSelect,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.passwords",
        referringId: id,
        department: "pessoal",
      });
      return listRecord(row);
    },
    async delete(context, id) {
      const organizationId = String(context.organizationId);
      const current = await prisma.passwordPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select: detailSelect,
      });
      if (!current) throw new ServiceError(404, "Senha de pessoal nao encontrada.");
      const row = await prisma.passwordPessoal.delete({ where: { id }, select: listSelect });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Exclusao",
        referring: "pessoal.passwords",
        referringId: id,
        department: "pessoal",
      });
      return listRecord(row);
    },
  };
}

function localPayrollService(
  prisma: PessoalDomainPrisma,
  env?: PessoalWorkerEnv,
): PessoalPayrollService {
  const select = {
    id: true,
    client_id: true,
    responsible_id: true,
    advance: true,
    advance_type: true,
    advance_amount: true,
    info: true,
    previous: true,
    onvio: true,
    group_id: true,
    vt: true,
    vt_value: true,
    vt_type: true,
    va: true,
    assistance_fee: true,
    union_id: true,
    bem_mais: true,
    bsf: true,
    reinf: true,
    employees: true,
    contact: true,
    organization_id: true,
  };
  const withGroup = async (row: Record<string, unknown>) => ({
    ...row,
    group: await prisma.pessoalGroup.findFirst({
      where: { id: row.group_id, organization_id: row.organization_id },
      select: { id: true, name: true, archived_at: true },
    }),
  });
  const ensureRelationships = async (organizationId: string, body: Record<string, unknown>) => {
    const client = await prisma.client.findFirst({
      where: { id: body.client_id, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    if (body.responsible_id) {
      const user = await prisma.user.findFirst({
        where: { id: body.responsible_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!user)
        throw new ServiceError(404, "Responsavel nao encontrado ou inelegivel para Pessoal.");
    }
    if (body.union_id) {
      const union = await prisma.unionPessoal.findFirst({
        where: { id: body.union_id, organization_id: organizationId },
        select: { id: true },
      });
      if (!union) throw new ServiceError(404, "Sindicato nao encontrado para a organizacao.");
    }
    const group = await prisma.pessoalGroup.findFirst({
      where: { id: body.group_id, organization_id: organizationId, archived_at: null },
      select: { id: true },
    });
    if (!group) throw new ServiceError(409, "Grupo de pessoal inexistente ou arquivado.");
    return String(group.id);
  };

  return {
    async detail(context, clientId) {
      const row = await prisma.payroll.findFirst({
        where: { client_id: clientId, organization_id: context.organizationId },
        select,
      });
      return row ? withGroup(row) : null;
    },
    async create(context, body) {
      const organizationId = String(context.organizationId);
      const existing = await prisma.payroll.findFirst({
        where: { client_id: body.client_id, organization_id: organizationId },
        select: { id: true },
      });
      if (existing) throw new ServiceError(409, "Folha de pessoal ja cadastrada para o cliente.");
      const groupId = await ensureRelationships(organizationId, body);
      const row = await prisma.payroll.create({
        data: {
          ...body,
          group_id: groupId,
          responsible_id: body.responsible_id ?? null,
          advance_type: body.advance_type ?? null,
          advance_amount: body.advance_amount ?? null,
          vt_value: body.vt_value ?? null,
          vt_type: body.vt_type ?? null,
          union_id: body.union_id ?? null,
          contact: body.contact ?? null,
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
        referring: "pessoal.payroll",
        referringId: String(row.id),
        department: "pessoal",
      });
      return withGroup(row);
    },
    async update(context, clientId, body) {
      const organizationId = String(context.organizationId);
      const existing = await prisma.payroll.findFirst({
        where: { client_id: clientId, organization_id: organizationId },
        select,
      });
      if (!existing) throw new ServiceError(404, "Folha de pessoal nao encontrada.");
      const groupId = await ensureRelationships(organizationId, {
        ...body,
        client_id: clientId,
      });
      const data = {
        ...body,
        group_id: groupId,
      };
      const row = await prisma.payroll.update({
        where: { client_id: clientId },
        data,
        select,
      });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.payroll",
        referringId: String(existing.id),
        department: "pessoal",
      });
      return withGroup(row);
    },
  };
}

function localObligationService(
  prisma: PessoalDomainPrisma,
  env?: PessoalWorkerEnv,
): PessoalObligationService {
  const select = {
    id: true,
    client_id: true,
    competence: true,
    responsavel_id: true,
    advance: true,
    payroll: true,
    charges: true,
    assistance_fee: true,
    bem_mais: true,
    bsf: true,
    va: true,
    vt: true,
    group_snapshot_id: true,
    group_snapshot_name: true,
    group_snapshot_policy: true,
    organization_id: true,
  };
  const payrollSelect = {
    client_id: true,
    responsible_id: true,
    advance: true,
    assistance_fee: true,
    bem_mais: true,
    bsf: true,
    va: true,
    vt: true,
    group_id: true,
  };
  const groupSelect = {
    id: true,
    name: true,
    policy: true,
    archived_at: true,
    organization_id: true,
  };
  const ensureClient = async (organizationId: string, clientId: unknown) => {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!client) throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
  };
  const buildData = (
    organizationId: string,
    competence: string,
    payroll: Record<string, unknown>,
    group: Record<string, unknown>,
  ) => ({
    client_id: payroll.client_id,
    competence,
    responsavel_id: payroll.responsible_id ?? null,
    advance: payroll.advance ? false : null,
    payroll: false,
    charges: false,
    assistance_fee: payroll.assistance_fee ? false : null,
    bem_mais: payroll.bem_mais ? false : null,
    bsf: payroll.bsf ? false : null,
    va: payroll.va ? false : null,
    vt: payroll.vt ? false : null,
    group_snapshot_id: group.id,
    group_snapshot_name: group.name,
    group_snapshot_policy: group.policy,
    organization_id: organizationId,
  });
  const validGroup = (group: Record<string, unknown> | null) => {
    if (!group)
      throw new ServiceError(409, "Folha de pessoal sem grupo canonico para gerar obrigacao.");
    if (group.archived_at)
      throw new ServiceError(409, "Grupo de pessoal arquivado nao gera novas obrigacoes.");
    if (group.policy === NO_OBLIGATIONS_GROUP_POLICY) return false;
    if (group.policy !== NORMAL_GROUP_POLICY)
      throw new ServiceError(409, "Politica de grupo de pessoal invalida.");
    return true;
  };

  return {
    async detail(context, query) {
      return prisma.obrigationsPessoal.findFirst({
        where: {
          organization_id: context.organizationId,
          client_id: query.client_id,
          competence: query.competence,
        },
        select,
      });
    },
    async create(context, body) {
      const organizationId = String(context.organizationId);
      await ensureClient(organizationId, body.client_id);
      const existing = await prisma.obrigationsPessoal.findFirst({
        where: {
          organization_id: organizationId,
          client_id: body.client_id,
          competence: body.competence,
        },
        select,
      });
      if (existing) return { created: false, obligation: existing, skippedNoObligations: false };
      const payroll = (await prisma.payroll.findFirst({
        where: { organization_id: organizationId, client_id: body.client_id },
        select: payrollSelect,
      })) as Record<string, unknown> | null;
      if (!payroll) throw new ServiceError(404, "Folha de pessoal nao encontrada para o cliente.");
      const group = payroll.group_id
        ? await prisma.pessoalGroup.findFirst({
            where: { id: payroll.group_id, organization_id: organizationId },
            select: groupSelect,
          })
        : null;
      if (!validGroup(group))
        return { created: false, obligation: null, skippedNoObligations: true };
      const obligation = await prisma.obrigationsPessoal.create({
        data: buildData(
          organizationId,
          String(body.competence),
          payroll,
          group as Record<string, unknown>,
        ),
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
        referring: "pessoal.obrigations",
        referringId: String(obligation.id),
        department: "pessoal",
      });
      return { created: true, obligation, skippedNoObligations: false };
    },
    async updateField(context, id, body) {
      const organizationId = String(context.organizationId);
      const existing = await prisma.obrigationsPessoal.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!existing) throw new ServiceError(404, "Obrigacao de pessoal nao encontrada.");
      if (body.responsavel_id) {
        const user = await prisma.user.findFirst({
          where: { id: body.responsavel_id, organization_id: organizationId },
          select: { id: true },
        });
        if (!user)
          throw new ServiceError(404, "Responsavel nao encontrado ou inelegivel para Pessoal.");
      }
      const updated = await prisma.obrigationsPessoal.update({ where: { id }, data: body, select });
      await audit(env, {
        organizationId,
        userId: String(context.userId),
        method: "ENTITY_CHANGE",
        statusCode: 200,
        outcome: "success",
        serviceSource: "pessoal-service",
        action: "Atualizacao",
        referring: "pessoal.obligations",
        referringId: id,
        department: "pessoal",
      });
      return updated;
    },
    async generateForCompetence(context, competence) {
      const organizationId = String(context.organizationId);
      const clients = (await prisma.client.findMany({
        where: { organization_id: organizationId, status: "Ativo", pessoal: true },
        select: { id: true },
      })) as Record<string, unknown>[];
      if (clients.length === 0) {
        return {
          clients: 0,
          payrollRows: 0,
          existing: 0,
          created: 0,
          skippedExisting: 0,
          skippedArchivedGroup: 0,
          skippedNoObligations: 0,
          skippedNoGroup: 0,
          skippedNoPayroll: 0,
        };
      }
      const ids = clients.map((client) => client.id);
      const payrollRows = (await prisma.payroll.findMany({
        where: { organization_id: organizationId, client_id: { in: ids } },
        select: payrollSelect,
      })) as Record<string, unknown>[];
      const existingRows = (await prisma.obrigationsPessoal.findMany({
        where: { organization_id: organizationId, competence, client_id: { in: ids } },
        select: { client_id: true },
      })) as Record<string, unknown>[];
      const groups = (await prisma.pessoalGroup.findMany({
        where: {
          organization_id: organizationId,
          id: { in: payrollRows.map((row) => row.group_id) },
        },
        select: groupSelect,
      })) as Record<string, unknown>[];
      const groupsById = new Map(groups.map((group) => [String(group.id), group]));
      const existingIds = new Set(existingRows.map((row) => String(row.client_id)));
      const data: Record<string, unknown>[] = [];
      let skippedArchivedGroup = 0;
      let skippedNoObligations = 0;
      let skippedNoGroup = 0;
      let skippedNoPayroll = 0;
      for (const client of clients) {
        const clientId = String(client.id);
        if (existingIds.has(clientId)) continue;
        const payroll = payrollRows.find((row) => String(row.client_id) === clientId);
        if (!payroll) {
          skippedNoPayroll += 1;
          continue;
        }
        const group = groupsById.get(String(payroll.group_id));
        if (!group) {
          skippedNoGroup += 1;
          continue;
        }
        if (group.archived_at) {
          skippedArchivedGroup += 1;
          continue;
        }
        if (group.policy === NO_OBLIGATIONS_GROUP_POLICY) {
          skippedNoObligations += 1;
          continue;
        }
        if (group.policy !== NORMAL_GROUP_POLICY) {
          throw new ServiceError(409, "Politica de grupo de pessoal invalida.");
        }
        data.push(buildData(organizationId, competence, payroll, group));
      }
      const result = await prisma.obrigationsPessoal.createMany({
        data,
        skipDuplicates: true,
      });
      if (result.count > 0) {
        await audit(env, {
          organizationId,
          userId: String(context.userId),
          method: "ENTITY_CHANGE",
          statusCode: 200,
          outcome: "success",
          serviceSource: "pessoal-service",
          action: "Geracao",
          referring: "pessoal.obligations",
          referringId: competence,
          department: "pessoal",
        });
      }
      return {
        clients: clients.length,
        payrollRows: payrollRows.length,
        existing: existingRows.length,
        created: result.count,
        skippedExisting: existingRows.length + data.length - result.count,
        skippedArchivedGroup,
        skippedNoObligations,
        skippedNoGroup,
        skippedNoPayroll,
      };
    },
  };
}

/**
 * Pago pelo status; vencido pelo status ou por vencimento anterior a hoje sem pagamento;
 * o resto \u00e9 aberto. Datas comparadas pelo dia em UTC, como o `due_date` \u00e9 gravado.
 */
export function summarizeLddStatuses(
  rows: { status?: unknown; due_date?: unknown }[],
  today: Date,
): { total: number; open: number; overdue: number; paid: number } {
  const todayKey = today.toISOString().slice(0, 10);
  const counts = { total: rows.length, open: 0, overdue: 0, paid: 0 };
  for (const row of rows) {
    const status = String(row.status ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .trim()
      .toLowerCase();
    const dueKey = row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : null;
    if (status === "pago") counts.paid += 1;
    else if (status === "vencido" || (dueKey !== null && dueKey < todayKey)) counts.overdue += 1;
    else counts.open += 1;
  }
  return counts;
}

function localOverviewService(prisma: PessoalDomainPrisma): PessoalOverviewService {
  return {
    async getSummary(context) {
      const organizationWhere = { organization_id: context.organizationId };
      const now = new Date();
      const competence = now.toISOString().slice(0, 7);
      const [unions, ldd, payrollTotal, obligationTotal] = await Promise.all([
        prisma.unionPessoal.findMany({
          where: organizationWhere,
          select: { base_date: true, cnpj: true },
        }),
        prisma.lddPessoal.findMany({
          where: organizationWhere,
          select: { status: true, due_date: true },
        }),
        prisma.payroll.count({ where: organizationWhere }),
        prisma.obrigationsPessoal.count({ where: { ...organizationWhere, competence } }),
      ]);
      const lddCounts = summarizeLddStatuses(ldd as Record<string, unknown>[], now);
      const unionRows = unions as Record<string, unknown>[];
      const withBaseDate = unionRows.filter((row) => row.base_date !== null).length;
      return {
        unions: {
          total: unionRows.length,
          withBaseDate,
          withoutBaseDate: unionRows.length - withBaseDate,
          withCnpj: unionRows.filter((row) => row.cnpj !== "").length,
        },
        ldd: lddCounts,
        payroll: { total: payrollTotal },
        obligations: { competence, total: obligationTotal },
      };
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
  // #1300: a escrita e a auditoria confirmam juntas. Se o audit-service recusar, a transação
  // é revertida e o cliente recebe erro sem nada gravado. Vale também para GET: revelar senha
  // grava e audita. O timeout cobre os 5s de espera pelo audit-service.
  const withDomainClient = <T>(c: PessoalContext, callback: (client: unknown) => Promise<T>) =>
    withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      client.$transaction((tx) => callback(tx), {
        maxWait: DOMAIN_TRANSACTION_MAX_WAIT_MS,
        timeout: DOMAIN_TRANSACTION_TIMEOUT_MS,
      }),
    );
  const withService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalGroupService) => Promise<T>,
  ) => {
    if (options.groupService) return callback(options.groupService);
    return withDomainClient(c, (client) =>
      callback(localService(client as unknown as PessoalGroupPrisma, options.env ?? c.env)),
    );
  };
  const withUnionService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalUnionService) => Promise<T>,
  ) => {
    if (options.unionService) return callback(options.unionService);
    return withDomainClient(c, (client) =>
      callback(localUnionService(client as unknown as PessoalDomainPrisma, options.env ?? c.env)),
    );
  };
  const withSituationService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalSituationService) => Promise<T>,
  ) => {
    if (options.situationService) return callback(options.situationService);
    return withDomainClient(c, (client) =>
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
    return withDomainClient(c, (client) =>
      callback(localLddService(client as unknown as PessoalDomainPrisma, options.env ?? c.env)),
    );
  };
  const withPasswordService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalPasswordService) => Promise<T>,
  ) => {
    if (options.passwordService) return callback(options.passwordService);
    return withDomainClient(c, (client) =>
      callback(
        localPasswordService(client as unknown as PessoalDomainPrisma, options.env ?? c.env),
      ),
    );
  };
  const withPayrollService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalPayrollService) => Promise<T>,
  ) => {
    if (options.payrollService) return callback(options.payrollService);
    return withDomainClient(c, (client) =>
      callback(localPayrollService(client as unknown as PessoalDomainPrisma, options.env ?? c.env)),
    );
  };
  const withObligationService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalObligationService) => Promise<T>,
  ) => {
    if (options.obligationService) return callback(options.obligationService);
    return withDomainClient(c, (client) =>
      callback(
        localObligationService(client as unknown as PessoalDomainPrisma, options.env ?? c.env),
      ),
    );
  };
  const withOverviewService = async <T>(
    c: PessoalContext,
    callback: (service: PessoalOverviewService) => Promise<T>,
  ) => {
    if (options.overviewService) return callback(options.overviewService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localOverviewService(client as unknown as PessoalDomainPrisma)),
    );
  };
  const withGroupAssignmentService = async <T>(
    c: PessoalContext,
    callback: (service: GroupAssignmentService) => Promise<T>,
  ) => {
    if (options.groupAssignmentService) return callback(options.groupAssignmentService);
    const env = options.env ?? c.env;
    return withWorkerPrisma(env, PrismaClient, (client) =>
      callback(
        new GroupAssignmentService(
          client as unknown as PessoalAssignmentPrisma,
          createPessoalAuditRecorder(env),
        ),
      ),
    );
  };
  const withUnionNotificationService = async <T>(
    c: PessoalContext,
    callback: (service: UnionNotificationService) => Promise<T>,
  ) => {
    if (options.unionNotificationService) return callback(options.unionNotificationService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new UnionNotificationService(client as unknown as PessoalNotificationPrisma)),
    );
  };
  const requireInternalToken = (c: PessoalContext): void => {
    const token = c.req.header(INTERNAL_SERVICE_TOKEN_HEADER);
    const expected = (options.env ?? c.env).INTERNAL_SERVICE_TOKEN;
    if (!token) throw new ServiceError(401, "Token interno nao informado.");
    if (token !== expected) throw new ServiceError(403, "Acesso negado.");
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
  app.get("/pessoal/passwords", (c) =>
    withPasswordService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(listPasswordsQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list({ organizationId: c.get("auth").organizationId }, query),
        ),
      );
    }),
  );
  app.get("/pessoal/passwords/:id", (c) =>
    withPasswordService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const { id } = parseWithZod(passwordIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.detail(domainContext(c), id)));
    }),
  );
  app.post("/pessoal/passwords", (c) =>
    withPasswordService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 3);
      const body = parseWithZod(createPasswordBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.create(domainContext(c), body)), 201);
    }),
  );
  app.patch("/pessoal/passwords/:id", (c) =>
    withPasswordService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 3);
      const { id } = parseWithZod(passwordIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updatePasswordBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.update(domainContext(c), id, body)));
    }),
  );
  app.delete("/pessoal/passwords/:id", (c) =>
    withPasswordService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 3);
      const { id } = parseWithZod(passwordIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.delete(domainContext(c), id)));
    }),
  );
  app.get("/pessoal/payroll/:client_id", (c) =>
    withPayrollService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const { client_id: clientId } = parseWithZod(payrollClientParamsSchema, {
        client_id: c.req.param("client_id"),
      });
      return c.json(
        createSuccessResponse(
          await service.detail({ organizationId: c.get("auth").organizationId }, clientId),
        ),
      );
    }),
  );
  app.post("/pessoal/payroll", (c) =>
    withPayrollService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createPayrollBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.create(domainContext(c), body)), 201);
    }),
  );
  app.patch("/pessoal/payroll/:client_id", (c) =>
    withPayrollService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { client_id: clientId } = parseWithZod(payrollClientParamsSchema, {
        client_id: c.req.param("client_id"),
      });
      const body = parseWithZod(updatePayrollBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.update(domainContext(c), clientId, body)));
    }),
  );
  app.get("/pessoal/obrigations", (c) =>
    withObligationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(detailObligationQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.detail({ organizationId: c.get("auth").organizationId }, query),
        ),
      );
    }),
  );
  app.post("/pessoal/obrigations", (c) =>
    withObligationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createObligationBodySchema, await c.req.json());
      const result = (await service.create(domainContext(c), body)) as { created: boolean };
      return c.json(createSuccessResponse(result), result.created ? 201 : 200);
    }),
  );
  app.post("/pessoal/obrigations/competences/:competence/generate", (c) =>
    withObligationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { competence } = parseWithZod(generateObligationsParamsSchema, {
        competence: c.req.param("competence"),
      });
      return c.json(
        createSuccessResponse(await service.generateForCompetence(domainContext(c), competence)),
      );
    }),
  );
  app.patch("/pessoal/obrigations/:id", (c) =>
    withObligationService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const { id } = parseWithZod(obligationIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateObligationFieldBodySchema, await c.req.json());
      return c.json(createSuccessResponse(await service.updateField(domainContext(c), id, body)));
    }),
  );
  app.get("/pessoal/overview", (c) =>
    withOverviewService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      return c.json(
        createSuccessResponse(
          await service.getSummary({ organizationId: c.get("auth").organizationId }),
        ),
      );
    }),
  );
  app.get("/pessoal/group-assignments/eligible", (c) =>
    withGroupAssignmentService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const query = parseWithZod(groupAssignmentEligibleQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.listEligible(domainContext(c), query)));
    }),
  );
  app.post("/pessoal/group-assignments/previews", (c) =>
    withGroupAssignmentService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(createGroupAssignmentPreviewBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.createPreview(domainContext(c), body)),
        201,
      );
    }),
  );
  app.get("/pessoal/group-assignments/previews/:preview_id", (c) =>
    withGroupAssignmentService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 1);
      const params = parseWithZod(groupAssignmentPreviewParamsSchema, {
        preview_id: c.req.param("preview_id"),
      });
      const query = parseWithZod(groupAssignmentPreviewQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.detailPreview(domainContext(c), params.preview_id, query),
        ),
      );
    }),
  );
  app.post("/pessoal/group-assignments/apply", (c) =>
    withGroupAssignmentService(c, async (service) => {
      requirePessoalPermission(c.get("auth"), 2);
      const body = parseWithZod(applyGroupAssignmentPreviewBodySchema, await c.req.json());
      const idempotencyKey = parseWithZod(
        groupAssignmentIdempotencyKeySchema,
        c.req.header("Idempotency-Key"),
      );
      return c.json(
        createSuccessResponse(await service.apply(domainContext(c), body, idempotencyKey)),
      );
    }),
  );
  app.post("/internal/pessoal/group-assignments/audit-outbox/reconcile", async (c) => {
    requireInternalToken(c);
    return withGroupAssignmentService(c, async (service) =>
      c.json(createSuccessResponse(await service.reconcilePendingAuditEvents())),
    );
  });
  app.post("/internal/pessoal/union-notifications/run", async (c) => {
    requireInternalToken(c);
    return withUnionNotificationService(c, async (service) =>
      c.json(createSuccessResponse(await service.runForDate({ now: new Date() }))),
    );
  });
  registerReportingRoutes(app, {
    env: (c) => options.env ?? c.env,
    withReportingService: (c, callback) =>
      options.reportingService
        ? callback(options.reportingService)
        : withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
            callback(
              new InternalReportingService(
                client as unknown as ConstructorParameters<typeof InternalReportingService>[0],
              ),
            ),
          ),
  });
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
