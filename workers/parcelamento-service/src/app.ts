import type { ListInstallmentsQuery } from "@workspace/parcelamento-service/src/schemas/installment.schemas.js";
import {
  installmentIdParamsSchema,
  listInstallmentsQuerySchema,
} from "@workspace/parcelamento-service/src/schemas/installment.schemas.js";
import { getPaginationParams } from "@workspace/parcelamento-service/src/schemas/pagination.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateParcelamentoRequest } from "./auth.js";
import type { ParcelamentoWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type InstallmentRow = Record<string, unknown> & { organization_id: string };
type InstallmentWhere = Record<string, unknown>;

interface ParcelamentoPrisma {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  installment: {
    count(args: { where: InstallmentWhere }): Promise<number>;
    findMany(args: {
      where: InstallmentWhere;
      select: Record<string, boolean>;
      orderBy: { id: "asc" };
      skip: number;
      take: number;
    }): Promise<InstallmentRow[]>;
    findFirst(args: {
      where: InstallmentWhere;
      select: Record<string, boolean>;
    }): Promise<InstallmentRow | null>;
  };
}

export interface ParcelamentoRequestContext {
  requestId: string;
  userId: string;
  organizationId: string;
  permission?: string;
}

export interface InstallmentServiceLike {
  list(
    context: ParcelamentoRequestContext,
    query: ListInstallmentsQuery,
  ): Promise<Record<string, unknown>>;
  getById(context: ParcelamentoRequestContext, id: string): Promise<Record<string, unknown>>;
}

interface ParcelamentoWorkerOptions {
  env?: ParcelamentoWorkerEnv;
  prisma?: ParcelamentoPrisma;
  installmentService?: InstallmentServiceLike;
}

type ParcelamentoWorkerVariables = { auth: WorkerAuthContext };
type ParcelamentoContext = Context<{
  Bindings: ParcelamentoWorkerEnv;
  Variables: ParcelamentoWorkerVariables;
}>;

const installmentSelect = {
  id: true,
  client_id: true,
  type: true,
  jurisdiction: true,
  is_automatic_debit: true,
  consolidated_total_amount: true,
  first_installment_amount: true,
  current_month_installment_amount: true,
  outstanding_balance: true,
  paid_installments_count: true,
  agreed_installments_count: true,
  remaining_installments_count: true,
  overdue_installments_count: true,
  enrollment_date: true,
  document_url: true,
  status: true,
  completion_date: true,
  down_payment_installments_count: true,
  legal_nature: true,
  situation_shutdown: true,
  agreement_number: true,
  organization_id: true,
} as const;

function context(c: ParcelamentoContext): ParcelamentoRequestContext {
  const auth = c.get("auth");
  return {
    requestId: c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID(),
    userId: auth.userId,
    organizationId: auth.organizationId,
    ...(auth.claims.permission === undefined ? {} : { permission: String(auth.claims.permission) }),
  };
}

function removeOrganizationId(row: InstallmentRow): Record<string, unknown> {
  const { organization_id: _organizationId, ...data } = row;
  return data;
}

function createPrismaInstallmentService(prisma: ParcelamentoPrisma): InstallmentServiceLike {
  return {
    async list(requestContext, query) {
      const { page, pageSize, skip, take } = getPaginationParams(query);
      const where: InstallmentWhere = { organization_id: requestContext.organizationId };
      if (query.client_id) where.client_id = query.client_id;
      if (query.status) where.status = query.status;
      if (query.type) where.type = query.type;
      if (query.jurisdiction) where.jurisdiction = query.jurisdiction;
      if (query.search) {
        where.OR = [
          { type: { contains: query.search } },
          { legal_nature: { contains: query.search } },
          { jurisdiction: { contains: query.search } },
          { status: { contains: query.search } },
        ];
      }

      const [total, rows] = await Promise.all([
        prisma.installment.count({ where }),
        prisma.installment.findMany({
          where,
          select: installmentSelect,
          orderBy: { id: "asc" },
          skip,
          take,
        }),
      ]);

      return {
        items: rows.map(removeOrganizationId),
        total,
        page,
        page_size: pageSize,
        has_more: page * pageSize < total,
      };
    },
    async getById(requestContext, id) {
      const row = await prisma.installment.findFirst({
        where: { id, organization_id: requestContext.organizationId },
        select: installmentSelect,
      });
      if (!row) throw new ServiceError(404, "Parcelamento nao encontrado.");
      return removeOrganizationId(row);
    },
  };
}

export function createParcelamentoWorkerApp(options: ParcelamentoWorkerOptions = {}) {
  const app = new Hono<{
    Bindings: ParcelamentoWorkerEnv;
    Variables: ParcelamentoWorkerVariables;
  }>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "parcelamento-service" })),
  );

  app.get("/ready", async (c) => {
    if (options.prisma) {
      await options.prisma.$queryRaw`SELECT 1`;
    } else {
      await withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) => {
        await client.$queryRaw`SELECT 1`;
      });
    }
    return c.json(createSuccessResponse({ status: "ready", service: "parcelamento-service" }));
  });

  const authenticate: MiddlewareHandler<{
    Bindings: ParcelamentoWorkerEnv;
    Variables: ParcelamentoWorkerVariables;
  }> = async (c, next) => {
    const auth = await authenticateParcelamentoRequest(c.req.raw, options.env ?? c.env);
    c.set("auth", auth);
    await next();
  };

  app.use("/parcelamento/*", authenticate);
  app.use("/parcelamento", authenticate);

  const withService = async <T>(
    c: ParcelamentoContext,
    callback: (service: InstallmentServiceLike) => Promise<T>,
  ): Promise<T> => {
    if (options.installmentService) return callback(options.installmentService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) =>
      callback(createPrismaInstallmentService(client as unknown as ParcelamentoPrisma)),
    );
  };

  app.get("/parcelamento/installments", async (c) =>
    withService(c, async (service) => {
      const url = new URL(c.req.url);
      const query = parseWithZod(
        listInstallmentsQuerySchema,
        Object.fromEntries(url.searchParams.entries()),
      );
      return c.json(createSuccessResponse(await service.list(context(c), query)));
    }),
  );

  app.get("/parcelamento/installments/:id", async (c) =>
    withService(c, async (service) => {
      const params = parseWithZod(installmentIdParamsSchema, { id: c.req.param("id") });
      return c.json(createSuccessResponse(await service.getById(context(c), params.id)));
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no parcelamento-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
