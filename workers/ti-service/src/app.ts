import {
  createSupabaseStorageClient,
  type SupabaseStorageClient,
  type WorkerAuthContext,
  withWorkerPrisma,
} from "@workspace/runtime";
import { parseWithZod, reportingQueryFields } from "@workspace/shared";
import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import {
  type InternalReportingGrant,
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/ti-service/src/schemas/internalReporting.schemas.js";
import {
  createTiExtensionBodySchema,
  listTiExtensionsQuerySchema,
  tiExtensionIdParamsSchema,
  updateTiExtensionBodySchema,
} from "@workspace/ti-service/src/schemas/tiExtension.schemas.js";
import {
  assignTiInventoryUserBodySchema,
  createTiInventoryBodySchema,
  listTiInventoryQuerySchema,
  returnTiInventoryBodySchema,
  tiInventoryIdParamsSchema,
  updateTiInventoryBodySchema,
} from "@workspace/ti-service/src/schemas/tiInventory.schemas.js";
import {
  createTiInventoryCategoryBodySchema,
  tiInventoryCategoryIdParamsSchema,
  updateTiInventoryCategoryBodySchema,
} from "@workspace/ti-service/src/schemas/tiInventoryCategory.schemas.js";
import {
  createTiInventoryLocationBodySchema,
  tiInventoryLocationIdParamsSchema,
  updateTiInventoryLocationBodySchema,
} from "@workspace/ti-service/src/schemas/tiInventoryLocation.schemas.js";
import {
  createTiPasswordBodySchema,
  deactivateTiPasswordBodySchema,
  listTiPasswordsQuerySchema,
  tiPasswordIdParamsSchema,
  updateTiPasswordBodySchema,
} from "@workspace/ti-service/src/schemas/tiPassword.schemas.js";
import {
  assignTiRequestBodySchema,
  createTiMessageBodySchema,
  createTiRequestBodySchema,
  listTiMessagesQuerySchema,
  listTiRequestsQuerySchema,
  tiRequestIdParamsSchema,
  updateTiRequestBodySchema,
  updateTiRequestStatusBodySchema,
} from "@workspace/ti-service/src/schemas/tiRequest.schemas.js";
import {
  createTiRequestCategoryBodySchema,
  listTiRequestCategoriesQuerySchema,
  tiRequestCategoryIdParamsSchema,
  updateTiRequestCategoryBodySchema,
} from "@workspace/ti-service/src/schemas/tiRequestCategory.schemas.js";
import {
  createTiRobotBodySchema,
  createTiRobotRunBodySchema,
  listTiRobotRunsQuerySchema,
  listTiRobotsQuerySchema,
  tiRobotIdParamsSchema,
  updateTiRobotBodySchema,
} from "@workspace/ti-service/src/schemas/tiRobot.schemas.js";
import {
  createTiStockCategoryBodySchema,
  createTiStockEntryBodySchema,
  createTiStockExitBodySchema,
  createTiStockItemBodySchema,
  createTiStockLocationBodySchema,
  listTiStockItemsQuerySchema,
  stockCategoryIdParamsSchema,
  stockItemIdParamsSchema,
  stockLocationIdParamsSchema,
  updateTiStockCategoryBodySchema,
  updateTiStockItemBodySchema,
  updateTiStockLocationBodySchema,
} from "@workspace/ti-service/src/schemas/tiStock.schemas.js";
import {
  createTiTermBodySchema,
  listTiTermsQuerySchema,
  signTiTermBodySchema,
  tiTermIdParamsSchema,
  updateTiTermBodySchema,
} from "@workspace/ti-service/src/schemas/tiTerm.schemas.js";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { authenticateTiRequest, guardTiSession, requireTiPermission } from "./auth.js";
import {
  createTiDomainServices,
  type TiAuthContext,
  type TiDatabase,
  type TiService,
  type TiServices,
} from "./domain.js";
import type { TiWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

type CategoryRow = Record<string, unknown> & { organization_id: string };
export type CategoryPrisma = {
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  inventoryCategoryTecnologia: {
    findMany(args: Record<string, unknown>): Promise<CategoryRow[]>;
    findFirst(args: Record<string, unknown>): Promise<CategoryRow | null>;
    create(args: Record<string, unknown>): Promise<CategoryRow>;
    update(args: Record<string, unknown>): Promise<CategoryRow>;
  };
  reportGrantUse?: {
    deleteMany(args: { where: { expires_at: { lte: Date } } }): Promise<unknown>;
    create(args: { data: { grant_hash: string; expires_at: Date } }): Promise<unknown>;
  };
};

export type TiCategoryService = {
  list(organizationId: string): Promise<unknown>;
  create(organizationId: string, input: Record<string, unknown>): Promise<unknown>;
  update(organizationId: string, id: string, input: Record<string, unknown>): Promise<unknown>;
};

type TiOptions = {
  env?: TiWorkerEnv;
  prisma?: CategoryPrisma;
  categoryService?: TiCategoryService;
  services?: TiServices;
  requestImageStorage?: TiRequestImageStorage;
};
type TiWorkerContext = {
  Bindings: TiWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type TiContext = Context<TiWorkerContext>;

type TiRequestImageStorage = {
  upload(input: {
    organizationId: string;
    requestId: string;
    file: { body: File; bytes: Uint8Array; mimetype: "image/jpeg" | "image/png" | "image/webp" };
  }): Promise<string>;
  remove(objectPath: string): Promise<void>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
};

function localService(prisma: CategoryPrisma): TiCategoryService {
  return {
    list: (organizationId) =>
      prisma.inventoryCategoryTecnologia.findMany({
        where: { organization_id: organizationId },
        orderBy: { name: "asc" },
      }),
    create: (organizationId, input) =>
      prisma.inventoryCategoryTecnologia.create({
        data: { ...input, organization_id: organizationId, active: true },
      }),
    async update(organizationId, id, input) {
      const existing = await prisma.inventoryCategoryTecnologia.findFirst({
        where: { id, organization_id: organizationId },
      });
      if (!existing) throw new ServiceError(404, "Categoria de inventário de TI não encontrada.");
      return prisma.inventoryCategoryTecnologia.update({ where: { id }, data: input });
    },
  };
}

function requestContext(c: TiContext): TiAuthContext {
  const auth = c.get("auth");
  return {
    organizationId: auth.organizationId,
    userId: auth.userId,
    permission: Number(auth.claims.modules?.ti ?? auth.claims.permission ?? 0),
    isOrganizationOwner: auth.claims.type === "owner",
  };
}

function requireTiTransferPermission(auth: WorkerAuthContext): void {
  requireTiPermission(auth, auth.claims.type === "owner" ? 1 : 2);
}

function invoke(service: TiService, method: string, args: unknown[]): Promise<unknown> {
  const handler = service[method];
  if (typeof handler !== "function") {
    throw new ServiceError(501, `Operação de TI não implementada: ${method}.`);
  }
  return handler(...args);
}

function createRequestImageStorage(env: TiWorkerEnv): TiRequestImageStorage | undefined {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TI_REQUEST_IMAGE_BUCKET) {
    return undefined;
  }
  const storage: SupabaseStorageClient = createSupabaseStorageClient({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return {
    async upload(input) {
      const extension = input.file.mimetype === "image/jpeg" ? "jpg" : input.file.mimetype.slice(6);
      const path = `ti/organizations/${input.organizationId}/requests/${input.requestId}/${crypto.randomUUID()}.${extension}`;
      await storage.upload(env.TI_REQUEST_IMAGE_BUCKET as string, path, input.file.body, {
        contentType: input.file.mimetype,
        upsert: false,
      });
      return path;
    },
    remove(path) {
      return storage.remove(env.TI_REQUEST_IMAGE_BUCKET as string, path);
    },
    createSignedAccessUrl(path) {
      return storage.createSignedUrl(env.TI_REQUEST_IMAGE_BUCKET as string, path, 300);
    },
  };
}

function validateImage(bytes: Uint8Array, mimetype: string): void {
  const startsWith = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  const valid =
    (mimetype === "image/jpeg" && startsWith([0xff, 0xd8, 0xff])) ||
    (mimetype === "image/png" && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (mimetype === "image/webp" &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
  if (!valid) throw new ServiceError(400, "A assinatura da imagem do chamado de TI é inválida.");
}

function validImagePath(path: string, organizationId: string, requestId: string): boolean {
  return new RegExp(
    `^ti/organizations/${organizationId}/requests/${requestId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$`,
    "iu",
  ).test(path);
}

async function withSignedRequestImage(
  message: unknown,
  storage: TiRequestImageStorage | undefined,
  organizationId: string,
  requestId: string,
): Promise<unknown> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return message;
  const item = { ...(message as Record<string, unknown>) };
  const attachment = item.attachment;
  if (attachment === undefined || attachment === null) return item;
  if (typeof attachment !== "string" || !validImagePath(attachment, organizationId, requestId)) {
    item.attachment = null;
    return item;
  }
  if (!storage) throw new ServiceError(500, "Storage de imagens de TI não configurado.");
  item.attachment = await storage.createSignedAccessUrl(attachment);
  return item;
}

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

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function constantTimeEqual(left: string | undefined, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < right.length; index += 1)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uniquePrismaError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

async function consumeReportingGrant(
  prisma: CategoryPrisma,
  grantValue: string,
  expiresAt: number,
): Promise<void> {
  const grantUse = prisma.reportGrantUse;
  if (!grantUse) throw new ServiceError(503, "Controle de replay de relatórios indisponível.");
  await grantUse.deleteMany({ where: { expires_at: { lte: new Date() } } });
  try {
    await grantUse.create({
      data: {
        grant_hash: await sha256Hex(grantValue),
        expires_at: new Date(expiresAt * 1000),
      },
    });
  } catch (error) {
    if (uniquePrismaError(error)) throw new ServiceError(403, "Grant de relatórios inválido.");
    throw error;
  }
}

async function verifyReportingGrant(
  c: TiContext,
  input: {
    operation: "catalog" | "extract";
    source: string;
    fields: readonly string[];
    body: unknown;
  },
  configuredEnv?: TiWorkerEnv,
  configuredPrisma?: CategoryPrisma,
): Promise<InternalReportingGrant> {
  const env = configuredEnv ?? (c.env as TiWorkerEnv | undefined);
  const token = c.req.header(INTERNAL_SERVICE_TOKEN_HEADER);
  const grantValue = c.req.header("x-reports-grant");
  const signature = c.req.header("x-reports-grant-signature");
  if (
    !env?.REPORTS_INTERNAL_TOKEN ||
    !env.REPORTS_GRANT_SECRET ||
    !constantTimeEqual(token, env.REPORTS_INTERNAL_TOKEN) ||
    !grantValue ||
    !signature
  )
    throw new ServiceError(403, "Acesso negado.");
  let grant: InternalReportingGrant;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(grantValue)));
    grant = internalReportingGrantSchema.parse(decoded);
    if (base64UrlEncode(canonicalJson(grant)) !== grantValue)
      throw new Error("canonical grant mismatch");
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    grant.fields.length === input.fields.length &&
    grant.fields.every((field, index) => field === input.fields[index]);
  const expectedSignature = await hmacHex(env.REPORTS_GRANT_SECRET, grantValue);
  const expectedBodyHash = await sha256Hex(canonicalJson(input.body));
  if (
    !constantTimeEqual(signature, expectedSignature) ||
    grant.operation !== input.operation ||
    grant.source !== input.source ||
    !fieldsMatch ||
    grant.request_id !== (c.req.header(REQUEST_ID_HEADER) ?? "") ||
    grant.body_sha256 !== expectedBodyHash ||
    grant.issued_at > now ||
    grant.expires_at <= now ||
    grant.expires_at <= grant.issued_at
  )
    throw new ServiceError(403, "Grant de relatórios inválido.");
  if (configuredPrisma) {
    await consumeReportingGrant(configuredPrisma, grantValue, grant.expires_at);
  } else {
    await withWorkerPrisma(env, PrismaClient, (client) =>
      consumeReportingGrant(client as unknown as CategoryPrisma, grantValue, grant.expires_at),
    );
  }
  return grant;
}

export function createTiWorkerApp(options: TiOptions = {}) {
  const app = new Hono<TiWorkerContext>();
  const execute = async <T>(
    c: TiContext,
    name: keyof TiServices,
    method: string,
    args: unknown[],
  ): Promise<T> => {
    const injected = options.services?.[name];
    if (injected) return (await invoke(injected, method, args)) as T;
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, async (client) => {
      const services = createTiDomainServices(
        client as unknown as TiDatabase,
        (options.env ?? c.env).MTK_ENCRYPTION_KEY,
      );
      const service = services[name];
      if (!service) throw new ServiceError(501, `Serviço de TI não implementado: ${String(name)}.`);
      return (await invoke(service, method, args)) as T;
    });
  };

  app.get("/health", (c) => c.json(createSuccessResponse({ status: "ok", service: "ti-service" })));
  app.get("/ready", async (c) => {
    if (options.prisma) await options.prisma.$queryRaw`SELECT 1`;
    else
      await withWorkerPrisma(
        options.env ?? c.env,
        PrismaClient,
        async (client) => client.$queryRaw`SELECT 1`,
      );
    return c.json(createSuccessResponse({ status: "ready", service: "ti-service" }));
  });

  app.use("/ti/*", async (c, next) => {
    const env = options.env ?? c.env;
    const auth = await authenticateTiRequest(c.req.raw, env);
    await guardTiSession(c.req.raw, env, auth);
    c.set("auth", auth);
    await next();
  });
  app.use("/ti", async (c, next) => {
    const env = options.env ?? c.env;
    const auth = await authenticateTiRequest(c.req.raw, env);
    await guardTiSession(c.req.raw, env, auth);
    c.set("auth", auth);
    await next();
  });

  const withService = async <T>(
    c: TiContext,
    callback: (service: TiCategoryService) => Promise<T>,
  ) => {
    if (options.categoryService) return callback(options.categoryService);
    return withWorkerPrisma(options.env ?? c.env, PrismaClient, (client) =>
      callback(localService(client as unknown as CategoryPrisma)),
    );
  };

  app.get("/ti/inventory-categories/list", (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 2);
      return c.json(createSuccessResponse(await service.list(c.get("auth").organizationId)));
    }),
  );
  app.post("/ti/inventory-categories", async (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 3);
      const body = parseWithZod(createTiInventoryCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.create(c.get("auth").organizationId, body)),
        201,
      );
    }),
  );
  app.patch("/ti/inventory-categories/:id", async (c) =>
    withService(c, async (service) => {
      requireTiPermission(c.get("auth"), 3);
      const params = parseWithZod(tiInventoryCategoryIdParamsSchema, { id: c.req.param("id") });
      const body = parseWithZod(updateTiInventoryCategoryBodySchema, await c.req.json());
      return c.json(
        createSuccessResponse(await service.update(c.get("auth").organizationId, params.id, body)),
      );
    }),
  );

  const respond = async <T>(
    c: TiContext,
    name: keyof TiServices,
    method: string,
    args: unknown[],
    status: 200 | 201 = 200,
  ) => c.json(createSuccessResponse(await execute<T>(c, name, method, args)), status);

  app.get("/ti/inventory/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const query = parseWithZod(listTiInventoryQuerySchema, c.req.query());
    return respond(c, "inventory", "list", [requestContext(c), query]);
  });
  app.get("/ti/inventory/:id", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiInventoryIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "inventory", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/inventory", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiInventoryBodySchema, await c.req.json());
    return respond(c, "inventory", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/inventory/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiInventoryIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiInventoryBodySchema, await c.req.json());
    return respond(c, "inventory", "update", [requestContext(c), params.id, body]);
  });
  app.patch("/ti/inventory/:id/assign-user", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiInventoryIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(assignTiInventoryUserBodySchema, await c.req.json());
    return respond(c, "inventory", "assignUser", [requestContext(c), params.id, body]);
  });
  app.patch("/ti/inventory/:id/return", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiInventoryIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(returnTiInventoryBodySchema, await c.req.json());
    return respond(c, "inventory", "returnAsset", [requestContext(c), params.id, body]);
  });

  app.get("/ti/inventory-locations/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    return respond(c, "inventoryLocations", "list", [requestContext(c)]);
  });
  app.post("/ti/inventory-locations", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiInventoryLocationBodySchema, await c.req.json());
    return respond(c, "inventoryLocations", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/inventory-locations/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiInventoryLocationIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiInventoryLocationBodySchema, await c.req.json());
    return respond(c, "inventoryLocations", "update", [requestContext(c), params.id, body]);
  });

  app.get("/ti/extensions/list", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const query = parseWithZod(listTiExtensionsQuerySchema, c.req.query());
    return respond(c, "extensions", "list", [requestContext(c), query]);
  });
  app.get("/ti/extensions/:id", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiExtensionIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "extensions", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/extensions", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiExtensionBodySchema, await c.req.json());
    return respond(c, "extensions", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/extensions/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiExtensionIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiExtensionBodySchema, await c.req.json());
    return respond(c, "extensions", "update", [requestContext(c), params.id, body]);
  });

  app.get("/ti/passwords/list", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const query = parseWithZod(listTiPasswordsQuerySchema, c.req.query());
    return respond(c, "passwords", "list", [requestContext(c), query]);
  });
  app.get("/ti/passwords/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiPasswordIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "passwords", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/passwords", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiPasswordBodySchema, await c.req.json());
    return respond(c, "passwords", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/passwords/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiPasswordIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiPasswordBodySchema, await c.req.json());
    return respond(c, "passwords", "update", [requestContext(c), params.id, body]);
  });
  app.post("/ti/passwords/:id/deactivate", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiPasswordIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(deactivateTiPasswordBodySchema, await c.req.json());
    return respond(c, "passwords", "deactivate", [requestContext(c), params.id, body]);
  });

  app.get("/ti/requests/list", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const query = parseWithZod(listTiRequestsQuerySchema, c.req.query());
    return respond(c, "requests", "list", [requestContext(c), query]);
  });
  app.get("/ti/requests/:id", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "requests", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/requests", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const body = parseWithZod(createTiRequestBodySchema, await c.req.json());
    return respond(c, "requests", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/requests/:id", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiRequestBodySchema, await c.req.json());
    return respond(c, "requests", "update", [requestContext(c), params.id, body]);
  });
  app.patch("/ti/requests/:id/assign", async (c) => {
    requireTiTransferPermission(c.get("auth"));
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(assignTiRequestBodySchema, await c.req.json());
    return respond(c, "requests", "assign", [requestContext(c), params.id, body]);
  });
  app.get("/ti/requests/:id/transfer-candidates", async (c) => {
    requireTiTransferPermission(c.get("auth"));
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "requests", "listTransferCandidates", [requestContext(c), params.id]);
  });
  app.patch("/ti/requests/:id/status", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiRequestStatusBodySchema, await c.req.json());
    return respond(c, "requests", "updateStatus", [requestContext(c), params.id, body]);
  });
  app.get("/ti/requests/:id/messages", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    const query = parseWithZod(listTiMessagesQuerySchema, c.req.query());
    const messages = await execute<unknown[]>(c, "requests", "listMessages", [
      requestContext(c),
      params.id,
      query,
    ]);
    const storage = options.requestImageStorage ?? createRequestImageStorage(options.env ?? c.env);
    const withLinks = await Promise.all(
      messages.map((message) =>
        withSignedRequestImage(message, storage, requestContext(c).organizationId, params.id),
      ),
    );
    return c.json(createSuccessResponse(withLinks));
  });
  app.post("/ti/requests/:id/messages", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiRequestIdParamsSchema, { id: c.req.param("id") });
    const contentType = c.req.header("content-type") ?? "";
    const form = contentType.includes("multipart/form-data")
      ? await c.req.parseBody()
      : ((await c.req.json()) as Record<string, unknown>);
    const body = parseWithZod(createTiMessageBodySchema, {
      message: form.message,
      type: form.type,
    });
    let attachment: string | undefined;
    let uploadedStorage: TiRequestImageStorage | undefined;
    const file = form.file instanceof File ? form.file : undefined;
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new ServiceError(400, "Formato de imagem não suportado.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024)
        throw new ServiceError(413, "A imagem do chamado de TI excede o limite permitido.");
      validateImage(bytes, file.type);
      const storage =
        options.requestImageStorage ?? createRequestImageStorage(options.env ?? c.env);
      if (!storage) throw new ServiceError(500, "Storage de imagens de TI não configurado.");
      uploadedStorage = storage;
      attachment = await storage.upload({
        organizationId: requestContext(c).organizationId,
        requestId: params.id,
        file: {
          body: file,
          bytes,
          mimetype: file.type as "image/jpeg" | "image/png" | "image/webp",
        },
      });
    }
    try {
      if (attachment && !validImagePath(attachment, requestContext(c).organizationId, params.id)) {
        throw new ServiceError(500, "Armazenamento da imagem retornou uma chave inválida.");
      }
      const message = await execute<unknown>(c, "requests", "createMessage", [
        requestContext(c),
        params.id,
        { ...body, ...(attachment ? { attachment } : {}) },
      ]);
      const storage =
        uploadedStorage ??
        options.requestImageStorage ??
        createRequestImageStorage(options.env ?? c.env);
      return c.json(
        createSuccessResponse(
          await withSignedRequestImage(
            message,
            storage,
            requestContext(c).organizationId,
            params.id,
          ),
        ),
        201,
      );
    } catch (error) {
      if (attachment && uploadedStorage)
        await uploadedStorage.remove(attachment).catch(() => undefined);
      throw error;
    }
  });

  app.get("/ti/request-categories/list", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const query = parseWithZod(listTiRequestCategoriesQuerySchema, c.req.query());
    return respond(c, "requestCategories", "list", [requestContext(c), query]);
  });
  app.post("/ti/request-categories", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const body = parseWithZod(createTiRequestCategoryBodySchema, await c.req.json());
    return respond(c, "requestCategories", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/request-categories/:id", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiRequestCategoryIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiRequestCategoryBodySchema, await c.req.json());
    return respond(c, "requestCategories", "update", [requestContext(c), params.id, body]);
  });

  app.get("/ti/robots/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const query = parseWithZod(listTiRobotsQuerySchema, c.req.query());
    return respond(c, "robots", "list", [requestContext(c), query]);
  });
  app.get("/ti/robots/:id", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiRobotIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "robots", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/robots", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiRobotBodySchema, await c.req.json());
    return respond(c, "robots", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/robots/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiRobotIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiRobotBodySchema, await c.req.json());
    return respond(c, "robots", "update", [requestContext(c), params.id, body]);
  });
  app.post("/ti/robots/:id/runs", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiRobotIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(createTiRobotRunBodySchema, await c.req.json());
    return respond(c, "robots", "createRun", [requestContext(c), params.id, body], 201);
  });
  app.get("/ti/robots/:id/runs/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(tiRobotIdParamsSchema, { id: c.req.param("id") });
    const query = parseWithZod(listTiRobotRunsQuerySchema, c.req.query());
    return respond(c, "robots", "listRuns", [requestContext(c), params.id, query]);
  });

  app.get("/ti/stock", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const query = parseWithZod(listTiStockItemsQuerySchema, c.req.query());
    return respond(c, "stock", "listItems", [requestContext(c), query]);
  });
  app.get("/ti/stock/items/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const query = parseWithZod(listTiStockItemsQuerySchema, c.req.query());
    return respond(c, "stock", "listItems", [requestContext(c), query]);
  });
  app.get("/ti/stock/items/:id", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(stockItemIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "stock", "getItemById", [requestContext(c), params.id]);
  });
  app.get("/ti/stock/items/:id/movements/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    const params = parseWithZod(stockItemIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "stock", "listItemMovements", [requestContext(c), params.id]);
  });
  app.post("/ti/stock/items", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiStockItemBodySchema, await c.req.json());
    return respond(c, "stock", "createItem", [requestContext(c), body], 201);
  });
  app.patch("/ti/stock/items/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(stockItemIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiStockItemBodySchema, await c.req.json());
    return respond(c, "stock", "updateItem", [requestContext(c), params.id, body]);
  });
  app.post("/ti/stock/items/:id/entries", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(stockItemIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(createTiStockEntryBodySchema, await c.req.json());
    return respond(c, "stock", "createEntry", [requestContext(c), params.id, body], 201);
  });
  app.post("/ti/stock/items/:id/exits", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(stockItemIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(createTiStockExitBodySchema, await c.req.json());
    return respond(c, "stock", "createExit", [requestContext(c), params.id, body], 201);
  });
  app.get("/ti/stock/categories/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    return respond(c, "stock", "listCategories", [requestContext(c)]);
  });
  app.post("/ti/stock/categories", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiStockCategoryBodySchema, await c.req.json());
    return respond(c, "stock", "createCategory", [requestContext(c), body], 201);
  });
  app.patch("/ti/stock/categories/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(stockCategoryIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiStockCategoryBodySchema, await c.req.json());
    return respond(c, "stock", "updateCategory", [requestContext(c), params.id, body]);
  });
  app.get("/ti/stock/locations/list", async (c) => {
    requireTiPermission(c.get("auth"), 2);
    return respond(c, "stock", "listLocations", [requestContext(c)]);
  });
  app.post("/ti/stock/locations", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiStockLocationBodySchema, await c.req.json());
    return respond(c, "stock", "createLocation", [requestContext(c), body], 201);
  });
  app.patch("/ti/stock/locations/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(stockLocationIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiStockLocationBodySchema, await c.req.json());
    return respond(c, "stock", "updateLocation", [requestContext(c), params.id, body]);
  });

  app.get("/ti/terms/list", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const query = parseWithZod(listTiTermsQuerySchema, c.req.query());
    return respond(c, "terms", "list", [requestContext(c), query]);
  });
  app.get("/ti/terms/:id", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiTermIdParamsSchema, { id: c.req.param("id") });
    return respond(c, "terms", "getById", [requestContext(c), params.id]);
  });
  app.post("/ti/terms", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const body = parseWithZod(createTiTermBodySchema, await c.req.json());
    return respond(c, "terms", "create", [requestContext(c), body], 201);
  });
  app.patch("/ti/terms/:id", async (c) => {
    requireTiPermission(c.get("auth"), 3);
    const params = parseWithZod(tiTermIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(updateTiTermBodySchema, await c.req.json());
    return respond(c, "terms", "update", [requestContext(c), params.id, body]);
  });
  app.patch("/ti/terms/:id/sign", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    const params = parseWithZod(tiTermIdParamsSchema, { id: c.req.param("id") });
    const body = parseWithZod(signTiTermBodySchema, await c.req.json());
    return respond(c, "terms", "sign", [requestContext(c), params.id, body]);
  });

  app.get("/ti/dashboard", async (c) => {
    requireTiPermission(c.get("auth"), 1);
    return respond(c, "dashboard", "getSummary", [requestContext(c)]);
  });

  app.get("/internal/reporting/catalog", async (c) => {
    await verifyReportingGrant(
      c,
      {
        operation: "catalog",
        source: "ti.catalog",
        fields: [],
        body: {},
      },
      options.env,
      options.prisma,
    );
    const catalog = await execute<unknown>(c, "reporting", "catalog", []);
    return c.json(createSuccessResponse(catalog));
  });
  app.post("/internal/reporting/extract", async (c) => {
    const body = parseWithZod(internalReportingExtractBodySchema, await c.req.json());
    const fields = reportingQueryFields(body.fields, body.query);
    const grant = await verifyReportingGrant(
      c,
      {
        operation: "extract",
        source: body.source,
        fields,
        body,
      },
      options.env,
      options.prisma,
    );
    const result = await execute<unknown>(c, "reporting", "extract", [
      { organizationId: grant.organization_id, ...body },
    ]);
    return c.json(createSuccessResponse(result));
  });

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no ti-service.",
    });
    if (serialized.statusCode >= 500) console.error(error);
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}

export type { TiWorkerEnv } from "./env.js";
