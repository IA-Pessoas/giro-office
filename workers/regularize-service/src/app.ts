import {
  licenseDetailQuerySchema,
  listLicensesQuerySchema,
} from "@workspace/regularize-service/src/schemas/license.schemas.js";
import { buildLicenseStatusFilter } from "@workspace/regularize-service/src/schemas/status.schemas.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateRegularizeRequest } from "./auth.js";
import type { RegularizeWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type LicenseRow = Record<string, unknown> & { organization_id: string };
export type RegularizeLicensePrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  license: {
    findMany(args: Record<string, unknown>): Promise<LicenseRow[]>;
    findFirst(args: Record<string, unknown>): Promise<LicenseRow | null>;
    count(args: Record<string, unknown>): Promise<number>;
  };
};
export type RegularizeLicenseService = {
  list(
    organizationId: string,
    status: string,
    page: number,
    limit: number,
    paginated: boolean,
  ): Promise<unknown>;
  detail(organizationId: string, id: string): Promise<unknown>;
};
type RegularizeOptions = {
  env?: RegularizeWorkerEnv;
  prisma?: RegularizeLicensePrisma;
  licenseService?: RegularizeLicenseService;
};
type RegularizeWorkerContext = {
  Bindings: RegularizeWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type RegularizeContext = Context<RegularizeWorkerContext>;

const select = {
  id: true,
  client_id: true,
  has: true,
  type_license: true,
  entry_date: true,
  protocol: true,
  responsible_id: true,
  status: true,
  date_last_consultation: true,
  current_situation: true,
  contact: true,
  observation: true,
  urgency: true,
  type: true,
  due_date: true,
  task_id: true,
  protocol_file_path: true,
  protocol_file_original_name: true,
  protocol_file_mime_type: true,
  protocol_file_size_bytes: true,
  protocol_file_uploaded_at: true,
};

function publicLicense(row: LicenseRow): Record<string, unknown> {
  const {
    organization_id: _organizationId,
    protocol_file_path: protocolFilePath,
    protocol_file_original_name: originalName,
    protocol_file_mime_type: mimeType,
    protocol_file_size_bytes: sizeBytes,
    protocol_file_uploaded_at: uploadedAt,
    ...license
  } = row;
  return protocolFilePath
    ? {
        ...license,
        protocol_file: {
          original_name: originalName,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          uploaded_at: uploadedAt,
        },
      }
    : license;
}

function localService(prisma: RegularizeLicensePrisma): RegularizeLicenseService {
  return {
    async list(organizationId, status, page, limit, paginated) {
      const where = { organization_id: organizationId, ...buildLicenseStatusFilter(status) };
      const args = {
        where,
        orderBy: { entry_date: "desc" },
        select,
        ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
      };
      const rows = await prisma.license.findMany(args);
      if (!paginated) return rows.map(publicLicense);
      const total = await prisma.license.count({ where });
      return {
        data: rows.map(publicLicense),
        total,
        page,
        limit,
        hasMore: page * limit < total,
      };
    },
    async detail(organizationId, id) {
      const row = await prisma.license.findFirst({
        where: { id, organization_id: organizationId },
        select,
      });
      if (!row) throw new ServiceError(404, "Alvará não encontrado.");
      return publicLicense(row);
    },
  };
}

export function createRegularizeWorkerApp(options: RegularizeOptions = {}) {
  const app = new Hono<RegularizeWorkerContext>();
  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "regularize-service" })),
  );
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "regularize-service" }));
  });
  app.use("/regularize/*", async (c, next) => {
    c.set("auth", await authenticateRegularizeRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  app.use("/regularize", async (c, next) => {
    c.set("auth", await authenticateRegularizeRequest(c.req.raw, options.env ?? c.env));
    await next();
  });
  const withService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeLicenseService) => Promise<T>,
  ) => {
    if (options.licenseService) return callback(options.licenseService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as RegularizeLicensePrisma)),
    );
  };
  app.get("/regularize/licenses", (c) =>
    withService(c, async (service) => {
      const query = parseWithZod(listLicensesQuerySchema, c.req.query());
      const url = new URL(c.req.url);
      return c.json(
        createSuccessResponse(
          await service.list(
            c.get("auth").organizationId,
            query.status,
            query.page,
            query.limit,
            url.searchParams.has("page") || url.searchParams.has("limit"),
          ),
        ),
      );
    }),
  );
  app.get("/regularize/license", (c) =>
    withService(c, async (service) => {
      const query = parseWithZod(licenseDetailQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await service.detail(c.get("auth").organizationId, query.id)),
      );
    }),
  );
  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no regularize-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { RegularizeWorkerEnv } from "./env.js";
