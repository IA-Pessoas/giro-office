import {
  RegularizeLicenseReportingService as RegularizeLicenseReportingServiceImpl,
  type RegularizeLicenseReportingService as RegularizeLicenseReportingServiceType,
  RegularizeMunicipalTaxesReportingService as RegularizeMunicipalTaxesReportingServiceImpl,
  type RegularizeMunicipalTaxesReportingService as RegularizeMunicipalTaxesReportingServiceType,
} from "@workspace/regularize-service/src/reporting/internalReportingService.js";
import { regularizeMunicipalTaxesReportingCatalog } from "@workspace/regularize-service/src/reporting/regularizeMunicipalTaxesReportingCatalog.js";
import { regularizeReportingCatalog } from "@workspace/regularize-service/src/reporting/regularizeReportingCatalog.js";
import {
  clientPfDetailQuerySchema,
  createClientPfBodySchema,
  listClientPfQuerySchema,
  updateClientPfBodySchema,
} from "@workspace/regularize-service/src/schemas/clientPf.schemas.js";
import { regularizeDashboardQuerySchema } from "@workspace/regularize-service/src/schemas/dashboard.schemas.js";
import {
  addGuidanceActivityBodySchema,
  addGuidancePartnerBodySchema,
  createGuidanceBodySchema,
  guidanceDetailQuerySchema,
  listGuidanceByProcessQuerySchema,
  removeGuidanceActivityBodySchema,
  removeGuidancePartnerBodySchema,
  updateGuidanceActivityBodySchema,
  updateGuidanceBodySchema,
  updateGuidancePartnerBodySchema,
} from "@workspace/regularize-service/src/schemas/guidance.schemas.js";
import {
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/regularize-service/src/schemas/internalReporting.schemas.js";
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
  createPartnerBodySchema,
  listPartnersQuerySchema,
  partnerDetailQuerySchema,
  partnerIdParamsSchema,
  updatePartnerBodySchema,
} from "@workspace/regularize-service/src/schemas/partners.schemas.js";
import {
  createPasswordBodySchema,
  createSitePasswordBodySchema,
  listPasswordsQuerySchema,
  listSitePasswordsQuerySchema,
  passwordDetailQuerySchema,
  sitePasswordDetailQuerySchema,
  updatePasswordBodySchema,
  updateSitePasswordBodySchema,
} from "@workspace/regularize-service/src/schemas/password.schemas.js";
import {
  createProcessBodySchema,
  listProcessesQuerySchema,
  processActionBodySchema,
  processDetailQuerySchema,
  updateProcessBodySchema,
} from "@workspace/regularize-service/src/schemas/process.schemas.js";
import { buildLicenseStatusFilter } from "@workspace/regularize-service/src/schemas/status.schemas.js";
import { ClientPfService } from "@workspace/regularize-service/src/services/clientPfService.js";
import {
  GuidanceService,
  type GuidanceService as GuidanceServiceType,
} from "@workspace/regularize-service/src/services/guidanceService.js";
import {
  licenseListClientSelect,
  withLicenseClientName,
} from "@workspace/regularize-service/src/services/licenseService.js";
import { MunicipalTaxesService } from "@workspace/regularize-service/src/services/municipalTaxesService.js";
import { PartnersService } from "@workspace/regularize-service/src/services/partnersService.js";
import { PasswordService } from "@workspace/regularize-service/src/services/passwordService.js";
import { ProcessService } from "@workspace/regularize-service/src/services/processService.js";
import {
  RegularizeDashboardService as RegularizeDashboardServiceImpl,
  type RegularizeDashboardService as RegularizeDashboardServiceType,
} from "@workspace/regularize-service/src/services/regularizeDashboardService.js";
import {
  RegularizeReconciliationService as RegularizeReconciliationServiceImpl,
  type RegularizeReconciliationService as RegularizeReconciliationServiceType,
} from "@workspace/regularize-service/src/services/regularizeReconciliationService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import {
  parseWithZod,
  REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
  reportingQueryFields,
} from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { assertRegularizeInternalToken, authenticateRegularizeRequest } from "./auth.js";
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
export type RegularizeClientPfService = Pick<
  ClientPfService,
  "create" | "update" | "detail" | "list"
>;
export type RegularizePartnersService = Pick<
  PartnersService,
  "create" | "update" | "detail" | "list" | "remove"
>;
export type RegularizePasswordService = Pick<
  PasswordService,
  "create" | "update" | "list" | "detail" | "createSite" | "updateSite" | "listSites" | "detailSite"
>;
export type RegularizeGuidanceService = Pick<
  GuidanceServiceType,
  | "create"
  | "update"
  | "detail"
  | "listByProcess"
  | "addEconomicActivity"
  | "updateEconomicActivity"
  | "removeEconomicActivity"
  | "addPartner"
  | "updatePartner"
  | "removePartner"
>;
export type RegularizeDashboardService = Pick<RegularizeDashboardServiceType, "getDashboard">;
export type RegularizeReconciliationService = Pick<
  RegularizeReconciliationServiceType,
  | "runFullReconciliation"
  | "runLicenseNotificationReconciliation"
  | "runInactiveClientPfStatusReconciliation"
  | "runClientPfDocumentNotificationReconciliation"
>;
export type RegularizeLicenseReportingService = Pick<
  RegularizeLicenseReportingServiceType,
  "extract"
>;
export type RegularizeMunicipalTaxesReportingService = Pick<
  RegularizeMunicipalTaxesReportingServiceType,
  "extract"
>;
type RegularizeOptions = {
  env?: RegularizeWorkerEnv;
  prisma?: RegularizeLicensePrisma;
  licenseService?: RegularizeLicenseService;
  processService?: RegularizeProcessService;
  municipalTaxesService?: RegularizeMunicipalTaxesService;
  clientPfService?: RegularizeClientPfService;
  partnersService?: RegularizePartnersService;
  passwordService?: RegularizePasswordService;
  guidanceService?: RegularizeGuidanceService;
  dashboardService?: RegularizeDashboardService;
  reconciliationService?: RegularizeReconciliationService;
  reportingService?: RegularizeLicenseReportingService;
  municipalTaxesReportingService?: RegularizeMunicipalTaxesReportingService;
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

const internalReportingCatalog = {
  sources: [
    ...regularizeReportingCatalog.sources,
    ...regularizeMunicipalTaxesReportingCatalog.sources,
  ],
  relations: [],
} as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  );
}

async function verifyReportingGrant(input: {
  env: RegularizeWorkerEnv;
  request: Request;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): Promise<{ organization_id: string }> {
  const reportingToken = input.env.REGULARIZE_REPORTING_TOKEN;
  const grantSecret = input.env.REGULARIZE_REPORTING_GRANT_SECRET;
  if (!reportingToken || !grantSecret) {
    throw new ServiceError(503, "Reporting interno não configurado.");
  }
  if (input.request.headers.get("x-internal-service-token") !== reportingToken) {
    throw new ServiceError(403, "Acesso negado.");
  }

  const grantValue = input.request.headers.get("x-reports-grant");
  const signature = input.request.headers.get("x-reports-grant-signature");
  if (!grantValue || !signature) throw new ServiceError(403, "Grant de relatórios inválido.");

  let grant: ReturnType<typeof internalReportingGrantSchema.parse>;
  try {
    grant = internalReportingGrantSchema.parse(
      JSON.parse(new TextDecoder().decode(base64UrlToBytes(grantValue))),
    );
    if (bytesToBase64Url(new TextEncoder().encode(canonicalJson(grant))) !== grantValue) {
      throw new Error("grant canonical mismatch");
    }
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }

  const expectedSignature = await hmacSha256Hex(grantSecret, grantValue);
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    grant.fields.length === input.fields.length &&
    grant.fields.every((field, index) => field === input.fields[index]);
  if (
    signature !== expectedSignature ||
    grant.operation !== input.operation ||
    grant.source !== input.source ||
    !fieldsMatch ||
    grant.request_id !== (input.request.headers.get(REQUEST_ID_HEADER) ?? "") ||
    grant.body_sha256 !== (await sha256Hex(canonicalJson(input.body))) ||
    grant.issued_at > now ||
    grant.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return grant;
}

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
        select: { ...select, client: licenseListClientSelect },
        ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
      };
      const rows = await prisma.license.findMany(args);
      const toListItem = (row: LicenseRow) =>
        withLicenseClientName(publicLicense(row), organizationId);
      if (!paginated) return rows.map(toListItem);
      const total = await prisma.license.count({ where });
      return {
        data: rows.map(toListItem),
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
  const withClientPfService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeClientPfService) => Promise<T>,
  ) => {
    if (options.clientPfService) return callback(options.clientPfService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) => {
      const prisma = client as never;
      return callback(new ClientPfService(prisma, new RegularizeReconciliationServiceImpl(prisma)));
    });
  };
  const withPartnersService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizePartnersService) => Promise<T>,
  ) => {
    if (options.partnersService) return callback(options.partnersService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) => {
      const prisma = client as never;
      return callback(new PartnersService(prisma, new RegularizeReconciliationServiceImpl(prisma)));
    });
  };
  const withPasswordService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizePasswordService) => Promise<T>,
  ) => {
    if (options.passwordService) return callback(options.passwordService);
    const env = options.env ?? c.env;
    if (!env.MTK_ENCRYPTION_KEY) {
      throw new ServiceError(503, "Criptografia do Regularize não configurada.");
    }
    return withWorkerPrisma(env, PrismaClient, (client) =>
      callback(new PasswordService(client as never, env.MTK_ENCRYPTION_KEY as string)),
    );
  };
  const withGuidanceService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeGuidanceService) => Promise<T>,
  ) => {
    if (options.guidanceService) return callback(options.guidanceService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new GuidanceService(client as never)),
    );
  };
  const withDashboardService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeDashboardService) => Promise<T>,
  ) => {
    if (options.dashboardService) return callback(options.dashboardService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new RegularizeDashboardServiceImpl(client as never)),
    );
  };
  const withReconciliationService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeReconciliationService) => Promise<T>,
  ) => {
    if (options.reconciliationService) return callback(options.reconciliationService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new RegularizeReconciliationServiceImpl(client as never)),
    );
  };
  const withReportingService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeLicenseReportingService) => Promise<T>,
  ) => {
    if (options.reportingService) return callback(options.reportingService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new RegularizeLicenseReportingServiceImpl(client as never)),
    );
  };
  const withMunicipalTaxesReportingService = async <T>(
    c: RegularizeContext,
    callback: (service: RegularizeMunicipalTaxesReportingService) => Promise<T>,
  ) => {
    if (options.municipalTaxesReportingService)
      return callback(options.municipalTaxesReportingService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(new RegularizeMunicipalTaxesReportingServiceImpl(client as never)),
    );
  };
  const requirePasswordReveal = (c: RegularizeContext): void => {
    if (Number(c.get("auth").claims.permission ?? 0) < 2) {
      throw new ServiceError(403, "Permissao insuficiente para revelar credencial.");
    }
  };
  const requireInternal = (c: RegularizeContext): void =>
    assertRegularizeInternalToken(c.req.raw, options.env ?? c.env);
  app.get("/internal/reporting/catalog", async (c) => {
    const body = {};
    await verifyReportingGrant({
      env: options.env ?? c.env,
      request: c.req.raw,
      operation: "catalog",
      source: "regularize.catalog",
      fields: [],
      body,
    });
    return c.json(createSuccessResponse(internalReportingCatalog));
  });
  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await c.req.json());
    const grant = await verifyReportingGrant({
      env: options.env ?? c.env,
      request: c.req.raw,
      operation: "extract",
      source: body.source,
      fields: reportingQueryFields(body.fields, body.query),
      body,
    });
    if (body.source === REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE) {
      return withMunicipalTaxesReportingService(c, async (service) =>
        c.json(
          createSuccessResponse(
            await service.extract({
              organizationId: grant.organization_id,
              source: REGULARIZE_MUNICIPAL_TAXES_REPORTING_SOURCE,
              fields: body.fields,
              limit: body.limit,
              ...(body.query ? { query: body.query } : {}),
            }),
          ),
        ),
      );
    }
    return withReportingService(c, async (service) =>
      c.json(
        createSuccessResponse(
          await service.extract({
            organizationId: grant.organization_id,
            source: body.source as "regularize.licenses" | "regularize.processes",
            fields: body.fields,
            limit: body.limit,
            ...(body.query ? { query: body.query } : {}),
          }),
        ),
      ),
    );
  });
  app.post("/internal/reconciliation/run", async (c) => {
    requireInternal(c);
    return withReconciliationService(c, async (service) =>
      c.json(createSuccessResponse(await service.runFullReconciliation())),
    );
  });
  app.post("/internal/reconciliation/license-notifications/run", async (c) => {
    requireInternal(c);
    return withReconciliationService(c, async (service) =>
      c.json(createSuccessResponse(await service.runLicenseNotificationReconciliation())),
    );
  });
  app.post("/internal/reconciliation/client-pf-status/run", async (c) => {
    requireInternal(c);
    return withReconciliationService(c, async (service) =>
      c.json(createSuccessResponse(await service.runInactiveClientPfStatusReconciliation())),
    );
  });
  app.post("/internal/reconciliation/client-pf-documents/run", async (c) => {
    requireInternal(c);
    return withReconciliationService(c, async (service) =>
      c.json(createSuccessResponse(await service.runClientPfDocumentNotificationReconciliation())),
    );
  });
  app.get("/regularize/dashboard", async (c) =>
    withDashboardService(c, async (service) => {
      const { year } = parseWithZod(regularizeDashboardQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await service.getDashboard(c.get("auth").organizationId, year)),
      );
    }),
  );
  app.post("/regularize/guidance", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(createGuidanceBodySchema, await c.req.json());
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
  app.put("/regularize/guidance", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(updateGuidanceBodySchema, await c.req.json());
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
  app.get("/regularize/guidance/detail", async (c) =>
    withGuidanceService(c, async (service) => {
      const { id } = parseWithZod(guidanceDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.get("/regularize/guidance/list", async (c) =>
    withGuidanceService(c, async (service) => {
      const rawQuery = c.req.query();
      const query = parseWithZod(listGuidanceByProcessQuerySchema, {
        ...rawQuery,
        ...(rawQuery.process_id === "" ? { process_id: null } : {}),
      });
      return c.json(
        createSuccessResponse(
          await service.listByProcess(
            c.get("auth").organizationId,
            query.process_id ?? undefined,
            query.target_type,
          ),
        ),
      );
    }),
  );
  app.post("/regularize/guidance/activity/add", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(addGuidanceActivityBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.addEconomicActivity({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            activity: body.activity,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/guidance/activity/remove", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(removeGuidanceActivityBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.removeEconomicActivity({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            itemId: body.item_id,
          }),
        ),
      );
    }),
  );
  app.put("/regularize/guidance/activity", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(updateGuidanceActivityBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.updateEconomicActivity({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            activity: body.activity,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/guidance/partner/add", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(addGuidancePartnerBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.addPartner({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            partner: body.partner,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/guidance/partner/remove", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(removeGuidancePartnerBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.removePartner({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            itemId: body.item_id,
          }),
        ),
      );
    }),
  );
  app.put("/regularize/guidance/partner", async (c) =>
    withGuidanceService(c, async (service) => {
      const body = parseWithZod(updateGuidancePartnerBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.updatePartner({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            guidanceId: body.guidance_id,
            partner: body.partner,
          }),
        ),
      );
    }),
  );
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
  app.post("/regularize/pf", async (c) =>
    withClientPfService(c, async (service) => {
      const body = parseWithZod(createClientPfBodySchema, await c.req.json());
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
  app.put("/regularize/pf", async (c) =>
    withClientPfService(c, async (service) => {
      const body = parseWithZod(updateClientPfBodySchema, await c.req.json());
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
  app.get("/regularize/pf", async (c) =>
    withClientPfService(c, async (service) => {
      const { id } = parseWithZod(clientPfDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.get("/regularize/pfs", async (c) =>
    withClientPfService(c, async (service) => {
      const query = parseWithZod(listClientPfQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list({ organizationId: c.get("auth").organizationId, ...query }),
        ),
      );
    }),
  );
  app.post("/regularize/partners", async (c) =>
    withPartnersService(c, async (service) => {
      const body = parseWithZod(createPartnerBodySchema, await c.req.json());
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
  app.put("/regularize/partners", async (c) =>
    withPartnersService(c, async (service) => {
      const body = parseWithZod(updatePartnerBodySchema, await c.req.json());
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
  app.get("/regularize/partner", async (c) =>
    withPartnersService(c, async (service) => {
      const { id } = parseWithZod(partnerDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.get("/regularize/partners", async (c) =>
    withPartnersService(c, async (service) => {
      const query = parseWithZod(listPartnersQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(
          await service.list(c.get("auth").organizationId, query.type, query.client_id),
        ),
      );
    }),
  );
  app.delete("/regularize/partners/:id", async (c) =>
    withPartnersService(c, async (service) => {
      const { id } = parseWithZod(partnerIdParamsSchema, { id: c.req.param("id") });
      return c.json(
        createSuccessResponse(
          await service.remove({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            id,
          }),
        ),
      );
    }),
  );
  app.post("/regularize/passwords", async (c) =>
    withPasswordService(c, async (service) => {
      const body = parseWithZod(createPasswordBodySchema, await c.req.json());
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
  app.put("/regularize/passwords", async (c) =>
    withPasswordService(c, async (service) => {
      const body = parseWithZod(updatePasswordBodySchema, await c.req.json());
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
  app.get("/regularize/passwords", async (c) =>
    withPasswordService(c, async (service) => {
      const { client_id: clientId } = parseWithZod(listPasswordsQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await service.list(c.get("auth").organizationId, clientId)),
      );
    }),
  );
  app.get("/regularize/password", async (c) =>
    withPasswordService(c, async (service) => {
      requirePasswordReveal(c);
      const { id } = parseWithZod(passwordDetailQuerySchema, c.req.query());
      return c.json(createSuccessResponse(await service.detail(c.get("auth").organizationId, id)));
    }),
  );
  app.post("/regularize/sites-pass", async (c) =>
    withPasswordService(c, async (service) => {
      const body = parseWithZod(createSitePasswordBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.createSite({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
        201,
      );
    }),
  );
  app.put("/regularize/sites-pass", async (c) =>
    withPasswordService(c, async (service) => {
      const body = parseWithZod(updateSitePasswordBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(
          await service.updateSite({
            organizationId: c.get("auth").organizationId,
            userId: c.get("auth").userId,
            body,
          }),
        ),
      );
    }),
  );
  app.get("/regularize/sites-pass", async (c) =>
    withPasswordService(c, async (service) => {
      const query = parseWithZod(listSitePasswordsQuerySchema, c.req.query());
      const url = new URL(c.req.url);
      return c.json(
        createSuccessResponse(
          await service.listSites({
            organizationId: c.get("auth").organizationId,
            ...query,
            paginationRequested: url.searchParams.has("page") || url.searchParams.has("limit"),
          }),
        ),
      );
    }),
  );
  app.get("/regularize/sites-pass-detail", async (c) =>
    withPasswordService(c, async (service) => {
      requirePasswordReveal(c);
      const { id } = parseWithZod(sitePasswordDetailQuerySchema, c.req.query());
      return c.json(
        createSuccessResponse(await service.detailSite(c.get("auth").organizationId, id)),
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
