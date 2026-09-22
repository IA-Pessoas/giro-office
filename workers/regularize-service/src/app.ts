import {
  createLicenseBodySchema,
  licenseDetailQuerySchema,
  listLicensesQuerySchema,
  updateLicenseBodySchema,
} from "@workspace/regularize-service/src/schemas/license.schemas.js";
import {
  createMunicipalTaxesBodySchema,
  listMunicipalTaxesQuerySchema,
  municipalTaxesDetailQuerySchema,
  updateMunicipalTaxesBodySchema,
} from "@workspace/regularize-service/src/schemas/municipalTaxes.schemas.js";
import {
  createProcessBodySchema,
  listProcessesQuerySchema,
  processActionBodySchema,
  processDetailQuerySchema,
  updateProcessBodySchema,
} from "@workspace/regularize-service/src/schemas/process.schemas.js";
import { buildLicenseStatusFilter } from "@workspace/regularize-service/src/schemas/status.schemas.js";
import { MunicipalTaxesService } from "@workspace/regularize-service/src/services/municipalTaxesService.js";
import { ProcessService } from "@workspace/regularize-service/src/services/processService.js";
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
import {
  createLicenseMutationService,
  type LicenseMutationPrisma,
  type LicenseMutationService,
  type LicenseRow,
} from "./licenseMutationService.js";
import {
  parseLicenseProtocolUpload,
  type WorkerLicenseProtocolStorageLike,
} from "./licenseProtocolStorage.js";
import { PrismaClient } from "./prisma.js";

export type RegularizeLicensePrisma = LicenseMutationPrisma & {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  license: {
    findMany(args: Record<string, unknown>): Promise<LicenseRow[]>;
    findFirst(args: Record<string, unknown>): Promise<LicenseRow | null>;
    count(args: Record<string, unknown>): Promise<number>;
  };
};
export type RegularizeLicenseService = LicenseMutationService & {
  list(
    organizationId: string,
    status: string,
    page: number,
    limit: number,
    paginated: boolean,
  ): Promise<unknown>;
  detail(organizationId: string, id: string): Promise<unknown>;
};
export type RegularizeProcessService = Pick<
  ProcessService,
  "create" | "update" | "detail" | "list" | "sendToFiscal" | "returnFromFiscal"
>;
export type RegularizeMunicipalTaxesService = Pick<
  MunicipalTaxesService,
  "create" | "update" | "detail" | "list"
>;
type RegularizeOptions = {
  env?: RegularizeWorkerEnv;
  prisma?: RegularizeLicensePrisma;
  licenseService?: RegularizeLicenseService;
  processService?: RegularizeProcessService;
  municipalTaxesService?: RegularizeMunicipalTaxesService;
  protocolStorage?: WorkerLicenseProtocolStorageLike;
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

function localService(
  prisma: RegularizeLicensePrisma,
  env: RegularizeWorkerEnv,
  protocolStorage?: WorkerLicenseProtocolStorageLike,
): RegularizeLicenseService {
  return {
    ...createLicenseMutationService(prisma, env, protocolStorage),
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
      callback(
        localService(
          client as unknown as RegularizeLicensePrisma,
          options.env ?? c.env,
          options.protocolStorage,
        ),
      ),
    );
  };
  const withProcessService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeProcessService) => Promise<T>,
  ) => {
    if (options.processService) return callback(options.processService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new ProcessService(client as never)),
    );
  };
  const withMunicipalTaxesService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeMunicipalTaxesService) => Promise<T>,
  ) => {
    if (options.municipalTaxesService) return callback(options.municipalTaxesService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new MunicipalTaxesService(client as never)),
    );
  };
  app.post("/regularize/process", async (c) =>
    withProcessService(c, async (service) => {
      const body = parseWithZod(createProcessBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.create({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
        201,
      );
    }),
  );
  app.put("/regularize/process", async (c) =>
    withProcessService(c, async (service) => {
      const body = parseWithZod(updateProcessBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.update({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/process/send-to-fiscal", async (c) =>
    withProcessService(c, async (service) => {
      const { id } = parseWithZod(processActionBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.sendToFiscal({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            processId: id,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/process/return-from-fiscal", async (c) =>
    withProcessService(c, async (service) => {
      const { id } = parseWithZod(processActionBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.returnFromFiscal({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            processId: id,
          }),
        ),
      );
    }),
  );
  app.get("/regularize/process", async (c) =>
    withProcessService(c, async (service) => {
      const { id } = parseWithZod(processDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.get("/regularize/processes", async (c) =>
    withProcessService(c, async (service) => {
      const query = parseWithZod(listProcessesQuerySchema, c.req.query());
      const url = new URL(c.req.url);
      return c.json(
        createSuccessResponse(
          await service.list({
            organizationId: c.get("auth").organizationId,
            ...query,
            paginationRequested: url.searchParams.has("page") || url.searchParams.has("limit"),
          }),
        ),
      );
    }),
  );
  app.post("/regularize/municipal-taxes", async (c) =>
    withMunicipalTaxesService(c, async (service) => {
      const body = parseWithZod(createMunicipalTaxesBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.create({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
        201,
      );
    }),
  );
  app.put("/regularize/municipal-taxes", async (c) =>
    withMunicipalTaxesService(c, async (service) => {
      const body = parseWithZod(updateMunicipalTaxesBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.update({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
      );
    }),
  );
  app.get("/regularize/municipal-taxes-detail", async (c) =>
    withMunicipalTaxesService(c, async (service) => {
      const { id } = parseWithZod(municipalTaxesDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.get("/regularize/municipal-taxes", async (c) =>
    withMunicipalTaxesService(c, async (service) => {
      const query = parseWithZod(listMunicipalTaxesQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list({ organizationId: c.get("auth").organizationId, ...query }),
        ),
      );
    }),
  );
  app.post("/regularize/license", async (c) =>
    withService(c, async (service) => {
      const body = parseWithZod(createLicenseBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.create({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
        201,
      );
    }),
  );
  app.put("/regularize/license", async (c) =>
    withService(c, async (service) => {
      const body = parseWithZod(updateLicenseBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.update({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/license/:id/protocol", async (c) =>
    withService(c, async (service) => {
      const body = await c.req.parseBody();
      const file = body.file instanceof File ? body.file : undefined;
      const parsed = await parseLicenseProtocolUpload(file);
      return c.json(
        createSuccessResponse(
          await service.replaceProtocol({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            licenseId: c.req.param("id"),
            file: parsed,
          }),
        ),
        201,
      );
    }),
  );
  app.get("/regularize/license/:id/protocol", async (c) =>
    withService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.createProtocolAccess({
            organizationId: c.get("auth").organizationId,
            licenseId: c.req.param("id"),
          }),
        ),
      ),
    ),
  );
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
