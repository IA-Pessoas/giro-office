import {
  createCategoryBodySchema,
  deleteCategoryBodySchema,
  updateCategoryBodySchema,
} from "@workspace/rh-service/src/schemas/category.schemas.js";
import {
  createHolidayBodySchema,
  deleteHolidayBodySchema,
  updateHolidayBodySchema,
} from "@workspace/rh-service/src/schemas/holiday.schemas.js";
import { markRhNotificationReadBodySchema } from "@workspace/rh-service/src/schemas/notification.schemas.js";
import {
  createScoreQuestionBodySchema,
  deleteScoreQuestionBodySchema,
  listScoreQuestionQuerySchema,
  updateScoreQuestionBodySchema,
} from "@workspace/rh-service/src/schemas/scoreQuestion.schemas.js";
import {
  approveTimeBankReleaseBodySchema,
  createTimeBankReleaseBodySchema,
  listTimeBankReleasesQuerySchema,
  timeBankSummaryUserParamsSchema,
} from "@workspace/rh-service/src/schemas/timeBankRelease.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { error as logError, parseTimeToDate, parseWithZod, TimeUtils } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateRhRequest, requireRhPermission } from "./auth.js";
import type { RhWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";
import { registerOperationalUserRoutes } from "./routes/operationalUsers.js";
import { registerPointRoutes } from "./routes/point.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerRequestRoutes } from "./routes/requests.js";
import { registerScoreRoutes } from "./routes/score.js";
import type { RhDb, RhRouteDeps } from "./routes/shared.js";
import { registerTimeSheetRoutes } from "./routes/timesheets.js";

export type RhCategoryPrisma = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $transaction?: (callback: (client: RhCategoryPrisma) => Promise<unknown>) => Promise<unknown>;
  rhCategory: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  scoreQuestion: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  holidays: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  pointsConfig: {
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  user: {
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  };
  timeBankReleases: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    count(args: Record<string, unknown>): Promise<number>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  rhNotification: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
};
export type RhCategoryService = {
  list(organizationId: string, activeOnly: boolean): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  delete(organizationId: string, id: string): Promise<unknown>;
};
export type RhNotificationService = {
  list(organizationId: string, userId: string): Promise<unknown>;
  markRead(input: {
    organization_id: string;
    user_id: string;
    id?: string;
    request_id?: string;
    all?: boolean;
  }): Promise<unknown>;
};
type RhScoreQuestionService = {
  create(input: Record<string, unknown>): Promise<unknown>;
  update(input: Record<string, unknown>): Promise<unknown>;
  list(organizationId: string, options: Record<string, unknown>): Promise<unknown>;
  delete(input: Record<string, unknown>): Promise<unknown>;
};
type RhHolidayService = {
  create(input: Record<string, unknown>): Promise<unknown>;
  update(input: Record<string, unknown>): Promise<unknown>;
  list(organizationId: string): Promise<unknown>;
  delete(input: Record<string, unknown>): Promise<unknown>;
};
type RhPointConfigService = {
  upsert(input: Record<string, unknown>): Promise<unknown>;
  getByUserId(userId: string, organizationId: string): Promise<unknown>;
};
type RhTimeBankService = {
  list(organizationId: string, filters: Record<string, unknown>): Promise<unknown>;
  create(input: Record<string, unknown>): Promise<unknown>;
  approve(input: Record<string, unknown>): Promise<unknown>;
  getSummary(organizationId: string, userId: string): Promise<unknown>;
  getOverview(organizationId: string): Promise<unknown>;
};
type RhOptions = {
  env?: RhWorkerEnv;
  prisma?: RhCategoryPrisma;
  /** Client usado pelas rotas portadas do serviço Node (ponto, solicitações, avaliações...). */
  db?: RhDb;
  categoryService?: RhCategoryService;
  notificationService?: RhNotificationService;
  scoreQuestionService?: RhScoreQuestionService;
  holidayService?: RhHolidayService;
  pointConfigService?: RhPointConfigService;
  timeBankService?: RhTimeBankService;
};
type RhWorkerContext = { Bindings: RhWorkerEnv; Variables: { auth: WorkerAuthContext } };
type RhContext = Context<RhWorkerContext>;

async function jsonBody(c: RhContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function localService(prisma: RhCategoryPrisma): RhCategoryService {
  return {
    list: (organizationId, activeOnly) =>
      prisma.rhCategory.findMany({
        where: { organization_id: organizationId, ...(activeOnly ? { active: true } : {}) },
        orderBy: { name: "asc" },
      }),
    async create(organizationId, input) {
      const duplicate = await prisma.rhCategory.findFirst({
        where: { organization_id: organizationId, name: input.name },
      });
      if (duplicate) throw new ServiceError(409, "Já existe uma categoria com este nome.");
      return prisma.rhCategory.create({ data: { ...input, organization_id: organizationId } });
    },
    async update(organizationId, input) {
      const existing = await prisma.rhCategory.findFirst({
        where: { id: input.id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Categoria não encontrada.");
      if (input.name !== undefined) {
        const duplicate = await prisma.rhCategory.findFirst({
          where: { organization_id: organizationId, name: input.name, id: { not: input.id } },
        });
        if (duplicate) throw new ServiceError(409, "Já existe uma categoria com este nome.");
      }
      return prisma.rhCategory.update({ where: { id: input.id }, data: input });
    },
    async delete(organizationId, id) {
      const existing = await prisma.rhCategory.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Categoria não encontrada.");
      const linkedRequests = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1
          FROM "rh.requests"
          WHERE "category_id" = ${id}
            AND "organization_id" = ${organizationId}
        ) AS "exists"
      `;
      if (linkedRequests[0]?.exists === true) {
        throw new ServiceError(
          409,
          "Não é possível remover a categoria: existem solicitações vinculadas a ela.",
        );
      }
      await prisma.rhCategory.deleteMany({ where: { id, organization_id: organizationId } });
      return { message: "Categoria removida com sucesso" };
    },
  };
}

function localNotificationService(prisma: RhCategoryPrisma): RhNotificationService {
  return {
    list: (organizationId, userId) =>
      prisma.rhNotification.findMany({
        where: { organization_id: organizationId, user_id: userId },
        orderBy: { created_at: "desc" },
        take: 50,
      }),
    markRead: ({ organization_id, user_id, id, request_id }) =>
      prisma.rhNotification.updateMany({
        where: {
          organization_id,
          user_id,
          read: false,
          ...(id ? { id } : {}),
          ...(request_id ? { request_id } : {}),
        },
        data: { read: true },
      }),
  };
}

function localScoreQuestionService(prisma: RhCategoryPrisma): RhScoreQuestionService {
  return {
    async create(input) {
      const id = crypto.randomUUID();
      return prisma.scoreQuestion.create({
        data: {
          id,
          question_id: id,
          organization_id: input.organization_id,
          question: input.question,
          type: input.type,
          active: input.active ?? true,
        },
        select: {
          id: true,
          question: true,
          type: true,
          active: true,
          question_id: true,
          organization_id: true,
        },
      });
    },
    async update(input) {
      const existing = await prisma.scoreQuestion.findFirst({
        where: { id: input.id, organization_id: input.organization_id },
      });
      if (!existing) throw new ServiceError(404, "Pergunta não encontrada.");
      const data = {
        ...(input.question !== undefined ? { question: input.question } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      return prisma.scoreQuestion.update({
        where: { id: input.id },
        data,
        select: {
          id: true,
          question: true,
          type: true,
          active: true,
          question_id: true,
          organization_id: true,
        },
      });
    },
    list: (organizationId, options) =>
      prisma.scoreQuestion.findMany({
        where: {
          organization_id: organizationId,
          ...(options.type !== undefined ? { type: options.type } : {}),
          ...(options.includeInactive === true ? {} : { active: true }),
        },
        orderBy: { type: "asc" },
        select: {
          id: true,
          question: true,
          type: true,
          active: true,
          question_id: true,
          organization_id: true,
        },
      }),
    async delete(input) {
      const existing = await prisma.scoreQuestion.findFirst({
        where: { id: input.id, organization_id: input.organization_id },
      });
      if (!existing) throw new ServiceError(404, "Pergunta não encontrada.");
      await prisma.scoreQuestion.update({
        where: { id: input.id },
        data: { active: false },
      });
      return { message: "Pergunta inativada com sucesso" };
    },
  };
}

const holidaySelect = { id: true, name: true, date: true, organization_id: true };

function utcDayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setMilliseconds(-1);
  return { start, end };
}

function localHolidayService(prisma: RhCategoryPrisma): RhHolidayService {
  const duplicate = (organizationId: string, date: Date, excludeId?: string) => {
    const { start, end } = utcDayBounds(date);
    return prisma.holidays.findFirst({
      where: {
        organization_id: organizationId,
        date: { gte: start, lte: end },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: holidaySelect,
    });
  };

  return {
    async create(input) {
      const existing = await duplicate(String(input.organization_id), input.date as Date);
      if (existing) throw new ServiceError(409, "Já existe um feriado cadastrado nesta data.");
      return prisma.holidays.create({
        data: {
          name: input.name,
          date: input.date,
          organization_id: input.organization_id,
        },
        select: holidaySelect,
      });
    },
    async update(input) {
      const existing = await prisma.holidays.findFirst({
        where: { id: input.id, organization_id: input.organization_id },
        select: holidaySelect,
      });
      if (!existing) throw new ServiceError(404, "Feriado não encontrado.");
      const duplicateHoliday = await duplicate(
        String(input.organization_id),
        input.date as Date,
        String(input.id),
      );
      if (duplicateHoliday) {
        throw new ServiceError(409, "Já existe um feriado cadastrado nesta data.");
      }
      return prisma.holidays.update({
        where: { id: input.id },
        data: { name: input.name, date: input.date },
        select: holidaySelect,
      });
    },
    list: (organizationId) =>
      prisma.holidays.findMany({
        where: { organization_id: organizationId },
        orderBy: { date: "asc" },
        select: holidaySelect,
      }),
    async delete(input) {
      const result = await prisma.holidays.deleteMany({
        where: { id: input.id, organization_id: input.organization_id },
      });
      if (result.count === 0) throw new ServiceError(404, "Feriado não encontrado.");
      return { message: "Feriado removido com sucesso" };
    },
  };
}

function localPointConfigService(prisma: RhCategoryPrisma): RhPointConfigService {
  const select = {
    id: true,
    user_id: true,
    organization_id: true,
    start_time: true,
    lunch_break: true,
    lunch_return: true,
    end_time: true,
    work_days: true,
    bank_balance: true,
    signature: true,
  };
  return {
    async upsert(input) {
      let startTime: Date;
      let lunchBreak: Date;
      let lunchReturn: Date;
      let endTime: Date;
      try {
        startTime = parseTimeToDate(String(input.start_time));
        lunchBreak = parseTimeToDate(String(input.lunch_break));
        lunchReturn = parseTimeToDate(String(input.lunch_return));
        endTime = parseTimeToDate(String(input.end_time));
      } catch (error) {
        throw new ServiceError(
          400,
          `Horários inválidos: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const existing = await prisma.pointsConfig.findUnique({
        where: { user_id: input.user_id },
      });
      if (existing && existing.organization_id !== input.organization_id) {
        throw new ServiceError(403, "Configuração de ponto pertence a outra organização.");
      }
      return prisma.pointsConfig.upsert({
        where: { user_id: input.user_id },
        update: {
          start_time: startTime,
          lunch_break: lunchBreak,
          lunch_return: lunchReturn,
          end_time: endTime,
          work_days: String(input.work_days ?? "").trim() || "1,2,3,4,5",
        },
        create: {
          user_id: input.user_id,
          organization_id: input.organization_id,
          start_time: startTime,
          lunch_break: lunchBreak,
          lunch_return: lunchReturn,
          end_time: endTime,
          work_days: String(input.work_days ?? "").trim() || "1,2,3,4,5",
        },
        select,
      });
    },
    getByUserId: (userId, organizationId) =>
      prisma.pointsConfig.findFirst({
        where: { user_id: userId, organization_id: organizationId },
        select,
      }),
  };
}

function localTimeBankService(prisma: RhCategoryPrisma): RhTimeBankService {
  const select = {
    id: true,
    user_id: true,
    date: true,
    minutes: true,
    reason: true,
    is_approved: true,
    added_by_user_id: true,
    organization_id: true,
  };
  return {
    async list(organizationId, filters) {
      return prisma.timeBankReleases.findMany({
        where: {
          organization_id: organizationId,
          ...(filters.user_id !== undefined ? { user_id: filters.user_id } : {}),
          ...(filters.is_approved !== undefined ? { is_approved: filters.is_approved } : {}),
          ...(filters.date_from || filters.date_to
            ? {
                date: {
                  ...(filters.date_from ? { gte: filters.date_from } : {}),
                  ...(filters.date_to ? { lte: filters.date_to } : {}),
                },
              }
            : {}),
        },
        select,
        orderBy: [{ date: "desc" }, { id: "desc" }],
      });
    },
    async create(input) {
      const user = await prisma.user.findFirst({
        where: { id: input.target_user_id, organization_id: input.organization_id },
        select: { id: true },
      });
      if (!user) throw new ServiceError(404, "Colaborador nao encontrado nesta organizacao.");
      return prisma.timeBankReleases.create({
        data: {
          user_id: input.target_user_id,
          date: input.date,
          minutes: input.minutes,
          reason: input.reason,
          is_approved: false,
          added_by_user_id: input.added_by_user_id,
          organization_id: input.organization_id,
        },
        select,
      });
    },
    async approve(input) {
      const release = await prisma.timeBankReleases.findFirst({
        where: { id: input.id, organization_id: input.organization_id },
        select,
      });
      if (!release) throw new ServiceError(404, "Lancamento nao encontrado.");
      if (release.is_approved) throw new ServiceError(409, "Lancamento ja foi aprovado.");
      const config = await prisma.pointsConfig.findUnique({
        where: { user_id: release.user_id },
        select: { user_id: true },
      });
      if (!config) {
        throw new ServiceError(
          404,
          "Configuracao de ponto nao encontrada para o colaborador; nao e possivel aprovar o lancamento.",
        );
      }
      const approveInTransaction = async (client: RhCategoryPrisma) => {
        const claimed = await client.timeBankReleases.updateMany({
          where: { id: input.id, organization_id: input.organization_id, is_approved: false },
          data: { is_approved: true },
        });
        if (claimed.count !== 1) throw new ServiceError(409, "Lancamento ja foi aprovado.");
        await client.pointsConfig.update({
          where: { user_id: release.user_id },
          data: { bank_balance: { increment: release.minutes } },
        });
        return client.timeBankReleases.findFirst({
          where: { id: input.id, organization_id: input.organization_id },
          select,
        });
      };
      return prisma.$transaction
        ? prisma.$transaction(approveInTransaction)
        : approveInTransaction(prisma);
    },
    async getSummary(organizationId, userId) {
      const config = await prisma.pointsConfig.findUnique({
        where: { user_id: userId },
        select: { user_id: true, organization_id: true, bank_balance: true },
      });
      if (!config) {
        throw new ServiceError(404, "Configuracao de ponto nao encontrada para o colaborador.");
      }
      if (config.organization_id !== organizationId) {
        throw new ServiceError(403, "Configuracao de ponto pertence a outra organizacao.");
      }
      const [approved, pending] = await Promise.all([
        prisma.timeBankReleases.count({
          where: { organization_id: organizationId, user_id: userId, is_approved: true },
        }),
        prisma.timeBankReleases.count({
          where: { organization_id: organizationId, user_id: userId, is_approved: false },
        }),
      ]);
      return {
        user_id: userId,
        balance_minutes: config.bank_balance,
        approved_releases_count: approved,
        pending_releases_count: pending,
      };
    },
    async getOverview(organizationId) {
      const [pending, approved, configs] = await Promise.all([
        prisma.timeBankReleases.count({
          where: { organization_id: organizationId, is_approved: false },
        }),
        prisma.timeBankReleases.count({
          where: { organization_id: organizationId, is_approved: true },
        }),
        prisma.pointsConfig.findMany({
          where: { organization_id: organizationId },
          select: { user_id: true, bank_balance: true },
        }),
      ]);
      return {
        total_pending_releases: pending,
        total_approved_releases: approved,
        users_with_positive_balance: (configs as Array<{ bank_balance: unknown }>).filter(
          (config) => Number(config.bank_balance) > 0,
        ).length,
        users_with_negative_balance: (configs as Array<{ bank_balance: unknown }>).filter(
          (config) => Number(config.bank_balance) < 0,
        ).length,
      };
    },
  };
}

export function createRhWorkerApp(options: RhOptions = {}) {
  const app = new Hono<RhWorkerContext>();
  app.get("/health", (c) => c.json(createSuccessResponse({ status: "ok", service: "rh-service" })));
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "rh-service" }));
  });
  app.use("/rh/*", async (c, next) => {
    c.set("auth", await authenticateRhRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/rh", async (c, next) => {
    c.set("auth", await authenticateRhRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: RhContext,
    callback: (service: RhCategoryService) => Promise<T>,
  ) => {
    if (options.categoryService) return callback(options.categoryService);
    if (options.prisma) return callback(localService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as RhCategoryPrisma)),
    );
  };
  const withNotificationService = async <T>(
    c: RhContext,
    callback: (service: RhNotificationService) => Promise<T>,
  ) => {
    if (options.notificationService) return callback(options.notificationService);
    if (options.prisma) return callback(localNotificationService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localNotificationService(client as unknown as RhCategoryPrisma)),
    );
  };
  const withScoreQuestionService = async <T>(
    c: RhContext,
    callback: (service: RhScoreQuestionService) => Promise<T>,
  ) => {
    if (options.scoreQuestionService) return callback(options.scoreQuestionService);
    if (options.prisma) return callback(localScoreQuestionService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localScoreQuestionService(client as unknown as RhCategoryPrisma)),
    );
  };
  const withHolidayService = async <T>(
    c: RhContext,
    callback: (service: RhHolidayService) => Promise<T>,
  ) => {
    if (options.holidayService) return callback(options.holidayService);
    if (options.prisma) return callback(localHolidayService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localHolidayService(client as unknown as RhCategoryPrisma)),
    );
  };
  const withPointConfigService = async <T>(
    c: RhContext,
    callback: (service: RhPointConfigService) => Promise<T>,
  ) => {
    if (options.pointConfigService) return callback(options.pointConfigService);
    if (options.prisma) return callback(localPointConfigService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localPointConfigService(client as unknown as RhCategoryPrisma)),
    );
  };
  const withTimeBankService = async <T>(
    c: RhContext,
    callback: (service: RhTimeBankService) => Promise<T>,
  ) => {
    if (options.timeBankService) return callback(options.timeBankService);
    if (options.prisma) return callback(localTimeBankService(options.prisma));
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localTimeBankService(client as unknown as RhCategoryPrisma)),
    );
  };
  app.get("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      const activeOnly = c.req.query("activeOnly") === "true";
      return c.json(
        createSuccessResponse(await service.list(c.get("auth").organizationId, activeOnly)),
      );
    }),
  );
  app.post("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(createCategoryBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        200,
      );
    }),
  );
  app.put("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(updateCategoryBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, body)),
      );
    }),
  );
  app.delete("/rh/categories", (c) =>
    withService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(deleteCategoryBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(await service.delete(c.get("auth").organizationId, body.id)),
      );
    }),
  );
  app.post("/rh/score/questions", (c) =>
    withScoreQuestionService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(createScoreQuestionBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.create({
            organization_id: c.get("auth").organizationId,
            question: body.question,
            type: body.type,
          }),
        ),
      );
    }),
  );
  app.put("/rh/score/questions", (c) =>
    withScoreQuestionService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(updateScoreQuestionBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.update({
            id: body.id,
            organization_id: c.get("auth").organizationId,
            ...(body.question !== undefined ? { question: body.question } : {}),
            ...(body.type !== undefined ? { type: body.type } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
          }),
        ),
      );
    }),
  );
  app.get("/rh/score/questions", (c) =>
    withScoreQuestionService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const query = parseWithZod(listScoreQuestionQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(c.get("auth").organizationId, {
            ...(query.type !== undefined ? { type: query.type } : {}),
            includeInactive: query.all === "true",
          }),
        ),
      );
    }),
  );
  app.delete("/rh/score/questions", (c) =>
    withScoreQuestionService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(deleteScoreQuestionBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.delete({
            id: body.id,
            organization_id: c.get("auth").organizationId,
          }),
        ),
      );
    }),
  );
  app.post("/rh/holidays", (c) =>
    withHolidayService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(createHolidayBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.create({
            organization_id: c.get("auth").organizationId,
            name: body.name,
            date: body.date,
          }),
        ),
      );
    }),
  );
  app.put("/rh/holidays", (c) =>
    withHolidayService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(updateHolidayBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.update({
            id: body.id,
            organization_id: c.get("auth").organizationId,
            name: body.name,
            date: body.date,
          }),
        ),
      );
    }),
  );
  app.get("/rh/holidays", (c) =>
    withHolidayService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      return c.json(createSuccessResponse(await service.list(c.get("auth").organizationId)));
    }),
  );
  app.delete("/rh/holidays", (c) =>
    withHolidayService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = parseWithZod(deleteHolidayBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.delete({
            id: body.id,
            organization_id: c.get("auth").organizationId,
          }),
        ),
      );
    }),
  );
  app.put("/rh/point-config", (c) =>
    withPointConfigService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      const body = (await jsonBody(c)) as Record<string, unknown>;
      const targetUserId = String(body.target_user_id ?? c.get("auth").userId);
      return c.json(
        createSuccessResponse(
          await service.upsert({
            user_id: targetUserId,
            organization_id: c.get("auth").organizationId,
            start_time: String(body.start_time ?? ""),
            lunch_break: String(body.lunch_break ?? ""),
            lunch_return: String(body.lunch_return ?? ""),
            end_time: String(body.end_time ?? ""),
            ...(body.work_days !== undefined ? { work_days: String(body.work_days) } : {}),
          }),
        ),
      );
    }),
  );
  app.get("/rh/point-config", (c) =>
    withPointConfigService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      return c.json(
        createSuccessResponse(
          await service.getByUserId(c.get("auth").userId, c.get("auth").organizationId),
        ),
      );
    }),
  );
  app.get("/rh/point-config/:userId", (c) =>
    withPointConfigService(c, async (service) => {
      requireRhPermission(c.get("auth"), 3);
      return c.json(
        createSuccessResponse(
          await service.getByUserId(c.req.param("userId"), c.get("auth").organizationId),
        ),
      );
    }),
  );
  app.get("/rh/time-bank-releases/list", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 1);
      const queryInput = c.req.query();
      if ((auth.claims.permission ?? 0) < 3) queryInput.user_id = auth.userId;
      const query = parseWithZod(listTimeBankReleasesQuerySchema, queryInput);
      return c.json(
        createSuccessResponse(
          await service.list(auth.organizationId, {
            ...(query.user_id !== undefined ? { user_id: query.user_id } : {}),
            ...(query.is_approved !== undefined
              ? { is_approved: query.is_approved === "true" }
              : {}),
            ...(query.date_from !== undefined
              ? { date_from: TimeUtils.getUtcDayBounds(query.date_from).dayStart }
              : {}),
            ...(query.date_to !== undefined
              ? { date_to: TimeUtils.getUtcDayBounds(query.date_to).dayEnd }
              : {}),
          }),
        ),
      );
    }),
  );
  app.post("/rh/time-bank-releases", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 3);
      const body = parseWithZod(createTimeBankReleaseBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.create({
            organization_id: auth.organizationId,
            target_user_id: body.user_id,
            date: body.date,
            minutes: body.minutes,
            reason: body.reason,
            added_by_user_id: auth.userId,
          }),
        ),
      );
    }),
  );
  app.put("/rh/time-bank-releases/approve", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 3);
      const body = parseWithZod(approveTimeBankReleaseBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.approve({ id: body.id, organization_id: auth.organizationId }),
        ),
      );
    }),
  );
  app.get("/rh/time-bank/summary", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 1);
      return c.json(
        createSuccessResponse(await service.getSummary(auth.organizationId, auth.userId)),
      );
    }),
  );
  app.get("/rh/time-bank/summary/:userId", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 3);
      const params = parseWithZod(timeBankSummaryUserParamsSchema, c.req.param());
      return c.json(
        createSuccessResponse(await service.getSummary(auth.organizationId, params.userId)),
      );
    }),
  );
  app.get("/rh/time-bank/overview", (c) =>
    withTimeBankService(c, async (service) => {
      const auth = c.get("auth");
      requireRhPermission(auth, 3);
      return c.json(createSuccessResponse(await service.getOverview(auth.organizationId)));
    }),
  );
  app.get("/rh/notifications", (c) =>
    withNotificationService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      return c.json(
        createSuccessResponse(
          await service.list(c.get("auth").organizationId, c.get("auth").userId),
        ),
      );
    }),
  );
  app.put("/rh/notifications/read", (c) =>
    withNotificationService(c, async (service) => {
      requireRhPermission(c.get("auth"), 1);
      const body = parseWithZod(markRhNotificationReadBodySchema, await jsonBody(c));
      return c.json(
        createSuccessResponse(
          await service.markRead({
            organization_id: c.get("auth").organizationId,
            user_id: c.get("auth").userId,
            ...body,
          }),
        ),
      );
    }),
  );
  const deps: RhRouteDeps = {
    env: (c) => options.env ?? c.env,
    withDb: (c, callback) =>
      options.db
        ? callback(options.db)
        : withWorkerPrisma(options.env ?? c.env, PrismaClient, callback),
  };
  registerPointRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerOperationalUserRoutes(app, deps);
  registerRequestRoutes(app, deps);
  registerScoreRoutes(app, deps);
  registerTimeSheetRoutes(app, deps);
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    logError("Erro na requisição do rh-worker", {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      statusCode: error instanceof ServiceError ? error.statusCode : 500,
      errorName: error instanceof Error ? error.name : "UnknownError",
      requestId: c.req.header(REQUEST_ID_HEADER),
    });
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no rh-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { RhWorkerEnv } from "./env.js";
