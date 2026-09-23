import {
  createCsrfToken,
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  createSupabaseStorageClient,
  hashCsrfToken,
  SESSION_MAX_AGE_SECONDS,
  type SupabaseStorageClient,
  withWorkerPrisma,
} from "@workspace/runtime";
import { normalizeModulePermissions } from "@workspace/shared/auth";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import { Hono, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { loginBodySchema } from "../../../services/user-service/src/schemas/auth.schemas.js";
import { reportingAccessContextBodySchema } from "../../../services/user-service/src/schemas/internalReporting.schemas.js";
import {
  permissionQuerySchema,
  permissionUserIdParamsSchema,
  updatePermissionBodySchema,
} from "../../../services/user-service/src/schemas/permission.schemas.js";
import { platformLoginBodySchema } from "../../../services/user-service/src/schemas/platformAuth.schemas.js";
import {
  listPlatformUsersQuerySchema,
  platformOrganizationUserParamsSchema,
  platformOrganizationUsersParamsSchema,
  transferPlatformOwnershipBodySchema,
  updatePlatformUserBodySchema,
} from "../../../services/user-service/src/schemas/platformUsers.schemas.js";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamsSchema,
} from "../../../services/user-service/src/schemas/user.schemas.js";
import type { UserAuditRecorder } from "./audit.js";
import {
  ACTIVE_MODULE_KEYS,
  activeOrganizationId,
  assertCanManageTarget,
  assertModulesWithinActor,
  authenticatePlatformValidationRequest,
  authenticateUserRequest,
  type PlatformIdentity,
  requireCsrf,
  requireManageUsers,
  requireOrganizationAuth,
  requireOwner,
  requirePlatformGatewayAuthorization,
  type UserAuthContext,
  validatePlatformSession,
  validateUserSession,
} from "./auth.js";
import type { UserWorkerEnv } from "./env.js";
import { errorResponse } from "./errors.js";
import { PrismaClient } from "./generated/prisma/client.js";
import {
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
  isLegacyBcryptHash,
} from "./passwordHash.js";
import type { Row, UserPrismaClient } from "./types.js";

interface HonoEnv {
  Bindings: UserWorkerEnv;
  Variables: { auth: UserAuthContext; platformIdentity: PlatformIdentity };
}

interface UserWorkerOptions {
  env?: UserWorkerEnv;
  prisma?: UserPrismaClient;
  storage?: SupabaseStorageClient;
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
  hashPassword?: (password: string) => Promise<string>;
  audit?: UserAuditRecorder;
}

const USER_PHOTO_BUCKET = "Fotos";
const USER_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const USER_PHOTO_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function envOf(c: { env: UserWorkerEnv }, options: UserWorkerOptions): UserWorkerEnv {
  return options.env ?? c.env;
}

async function withDb<T>(
  c: { env: UserWorkerEnv },
  options: UserWorkerOptions,
  callback: (db: UserPrismaClient) => Promise<T>,
): Promise<T> {
  if (options.prisma) return callback(options.prisma);
  if (!envOf(c, options).HYPERDRIVE) {
    throw new ServiceError(503, "Hyperdrive não configurado para o runtime Worker.");
  }
  return withWorkerPrisma(
    envOf(c, options),
    PrismaClient as unknown as new (options: {
      adapter: unknown;
    }) => UserPrismaClient,
    callback,
  );
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ServiceError(400, error.issues[0]?.message ?? "Dados inválidos.");
    }
    throw error;
  }
}

async function jsonBody(c: { req: { json<T>(): Promise<T> } }): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "JSON inválido.");
  }
}

function userSelect() {
  return {
    id: true,
    name: true,
    login: true,
    permission: true,
    status: true,
    department_id: true,
    photo_url: true,
    joined_at: true,
    organization_id: true,
    type: true,
    first_owner_flag: true,
    permission_id: true,
    version: true,
  };
}

function modulesFrom(row: Row | null): Record<string, number> {
  return Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, Number(row?.[key] ?? 0)]));
}

function toUser(row: Row, organizationId: string): Row {
  return { ...row, organization_id: row.organization_id ?? organizationId };
}

function organizationUserWhere(userId: string, organizationId: string): Record<string, unknown> {
  return {
    id: userId,
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

function organizationUsersWhere(organizationId: string): Record<string, unknown> {
  return {
    OR: [
      { organization_id: organizationId },
      { organization_id: null, department: { organization_id: organizationId } },
    ],
  };
}

async function requireDepartmentInOrganization(
  db: UserPrismaClient,
  departmentId: string,
  organizationId: string,
): Promise<Row> {
  if (!db.department.findFirst) throw new ServiceError(503, "Departamentos não configurados.");
  const department = await db.department.findFirst({
    where: { id: departmentId, organization_id: organizationId },
    select: { id: true, name: true, organization_id: true },
  });
  if (!department) throw new ServiceError(403, "Departamento não pertence à organização.");
  return department;
}

function knownModules(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    ACTIVE_MODULE_KEYS.filter(
      (key) => typeof (input as Record<string, unknown>)[key] === "number",
    ).map((key) => [key, (input as Record<string, number>)[key]]),
  );
}

function modulesForCreate(
  type: unknown,
  permission: number,
  departmentName: unknown,
  supplied: unknown,
): Record<string, number> {
  const modules = knownModules(supplied);
  if (type === "owner") {
    return Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, 3]));
  }
  if (permission >= 1) {
    modules.rh = Math.max(modules.rh ?? 0, 1);
    modules.ti = Math.max(modules.ti ?? 0, 1);
  }
  if (type === "admin") {
    const module = departmentModule(departmentName);
    if (module) modules[module] = 3;
  }
  return modules;
}

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signSessionToken(claims: Record<string, unknown>, secret: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      ...claims,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    }),
  );
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

function sessionCookies(
  c: { header(name: string, value: string, options?: { append?: boolean }): void },
  cookies: string[],
) {
  for (const cookie of cookies) c.header("Set-Cookie", cookie, { append: true });
}

function sessionUserData(row: Row, organizationId: string, modules: Row): Row {
  return {
    id: row.id,
    name: row.name,
    login: row.login,
    permission: row.permission,
    ...(row.type ? { type: row.type } : {}),
    modules: normalizeModulePermissions(modules),
    department_id: row.department_id,
    organization_id: organizationId,
  };
}

function departmentModule(name: unknown): string | null {
  const normalized = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  const aliases: Record<string, string> = {
    certificado: "certificado",
    comercial: "comercial",
    contabil: "contabil",
    contabilidade: "contabil",
    financeiro: "financeiro",
    fiscal: "fiscal",
    integracao: "integracao",
    integracao_de_clientes: "integracao",
    marketing: "marketing",
    parcelamento: "parcelamento",
    pessoal: "pessoal",
    departamento_pessoal: "pessoal",
    regularize: "regularize",
    rh: "rh",
    recursos_humanos: "rh",
    tecnologia: "ti",
    ti: "ti",
    triagem: "triagem",
  };
  return aliases[normalized] ?? null;
}

function userPhotoStorage(
  env: UserWorkerEnv,
  options: UserWorkerOptions,
): SupabaseStorageClient | undefined {
  if (options.storage) return options.storage;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
  return createSupabaseStorageClient({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

const SIGNED_PHOTO_URL_TTL_SECONDS = 3600;
const DEFAULT_NON_OWNER_PERMISSION = 1;
const OWNER_GLOBAL_PERMISSION = 2;
const MAX_MODULE_PERMISSION = 3;

const EMPTY_MODULES = Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, 0])) as Record<
  string,
  number
>;

const MAX_MODULES = Object.fromEntries(
  ACTIVE_MODULE_KEYS.map((key) => [key, MAX_MODULE_PERMISSION]),
) as Record<string, number>;

function normalizePermissionForType(type: unknown, permission: number): number {
  if (type === "owner") return OWNER_GLOBAL_PERMISSION;
  if (type === "admin" && permission >= OWNER_GLOBAL_PERMISSION) {
    return DEFAULT_NON_OWNER_PERMISSION;
  }
  return permission;
}

function withDefaultSelfServiceModules(
  modules: Record<string, number>,
  permission: number,
): Record<string, number> {
  if (permission < DEFAULT_NON_OWNER_PERMISSION) return modules;
  return {
    ...modules,
    rh: Math.max(Number(modules.rh ?? 0), DEFAULT_NON_OWNER_PERMISSION),
    ti: Math.max(Number(modules.ti ?? 0), DEFAULT_NON_OWNER_PERMISSION),
  };
}

function normalizedModulesForNonOwner(
  type: unknown,
  permission: number,
  departmentName: unknown,
  status: unknown = "active",
): Record<string, number> {
  if (status !== "active") return { ...EMPTY_MODULES };
  if (type === "owner") return { ...MAX_MODULES };

  const modules = { ...EMPTY_MODULES };
  if (permission >= DEFAULT_NON_OWNER_PERMISSION) {
    modules.rh = DEFAULT_NON_OWNER_PERMISSION;
    modules.ti = DEFAULT_NON_OWNER_PERMISSION;
  }
  if (type === "admin") {
    const departmentModuleName = departmentModule(departmentName);
    if (departmentModuleName) modules[departmentModuleName] = MAX_MODULE_PERMISSION;
  }
  return modules;
}

function photoObjectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const publicMarker = `/storage/v1/object/public/${USER_PHOTO_BUCKET}/`;
  const markerIndex = trimmed.indexOf(publicMarker);
  if (markerIndex >= 0) {
    return trimmed
      .slice(markerIndex + publicMarker.length)
      .split("/")
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      })
      .join("/");
  }

  if (/^https?:\/\//iu.test(trimmed)) return null;
  return trimmed.replace(/^\/+|\.+$/gu, "") || null;
}

async function requirePrivatePhotoBucket(storage: SupabaseStorageClient): Promise<void> {
  const bucket = await storage.getBucket(USER_PHOTO_BUCKET);
  if (bucket.public) {
    throw new ServiceError(503, "O bucket Fotos deve ser privado para servir URLs assinadas.");
  }
}

async function signedPhotoUrl(storage: SupabaseStorageClient, objectPath: string): Promise<string> {
  await requirePrivatePhotoBucket(storage);
  return storage.createSignedUrl(USER_PHOTO_BUCKET, objectPath, SIGNED_PHOTO_URL_TTL_SECONDS);
}

async function parseUserPhoto(c: {
  req: { parseBody(): Promise<Record<string, unknown>> };
}): Promise<{
  file: File;
  extension: (typeof USER_PHOTO_EXTENSIONS)[keyof typeof USER_PHOTO_EXTENSIONS];
}> {
  const body = await c.req.parseBody();
  const file = body.file instanceof File ? body.file : undefined;
  if (!file) throw new ServiceError(400, "Arquivo de imagem e obrigatorio.");
  if (file.size === 0) throw new ServiceError(400, "Arquivo de imagem e obrigatorio.");
  if (file.size > USER_PHOTO_MAX_SIZE_BYTES) {
    throw new ServiceError(413, "A imagem deve ter no máximo 5 MB.");
  }
  const extension = USER_PHOTO_EXTENSIONS[file.type as keyof typeof USER_PHOTO_EXTENSIONS];
  if (!extension) {
    throw new ServiceError(400, "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validSignature =
    (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (file.type === "image/png" &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )) ||
    (file.type === "image/webp" &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
  if (!validSignature) {
    throw new ServiceError(400, "Assinatura do arquivo não corresponde ao tipo informado.");
  }
  return { file, extension };
}

async function refreshOrganizationSession(
  db: UserPrismaClient,
  auth: UserAuthContext,
  env: UserWorkerEnv,
): Promise<Row & { token: string; csrfToken: string }> {
  const sessionId = auth.claims.session_id;
  const sessionVersion = auth.claims.session_version;
  const csrfHash = auth.claims.csrf_hash;
  if (
    !sessionId ||
    !Number.isSafeInteger(sessionVersion) ||
    typeof csrfHash !== "string" ||
    !auth.organizationId
  ) {
    throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  }

  const user = await db.user.findFirst({
    where: organizationUserWhere(auth.userId, auth.organizationId),
    select: { ...userSelect(), password: false, session_version: true },
  });
  if (!user || user.status !== "active" || user.session_version !== sessionVersion) {
    throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  }

  const permission = await db.permission.findFirst({
    where: { user_id: auth.userId, organization_id: auth.organizationId },
    select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
  });
  const nextCsrfToken = createCsrfToken();
  const nextCsrfHash = await hashCsrfToken(nextCsrfToken);
  if (!db.authSession.updateMany) throw new ServiceError(503, "Sessão não configurada.");
  const updated = await db.authSession.updateMany({
    where: {
      id: sessionId,
      user_id: auth.userId,
      csrf_hash: csrfHash,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    data: {
      csrf_hash: nextCsrfHash,
      expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  if (updated.count !== 1) {
    const currentSession = await db.authSession.findFirst({
      where: { id: sessionId, user_id: auth.userId, revoked_at: null },
      select: { csrf_hash: true },
    });
    if (currentSession?.csrf_hash !== csrfHash) {
      throw new ServiceError(409, "Sessão substituída por uma renovação mais recente.");
    }
    throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  }

  const modules = normalizeModulePermissions(permission);
  const token = await signSessionToken(
    {
      user_id: auth.userId,
      organization_id: auth.organizationId,
      name: user.name,
      login: user.login,
      permission: user.permission,
      type: user.type,
      session_version: sessionVersion,
      session_id: sessionId,
      modules,
      csrf_hash: nextCsrfHash,
    },
    env.JWT_SECRET,
  );
  return {
    ...sessionUserData(user, auth.organizationId, modules),
    token,
    csrfToken: nextCsrfToken,
  };
}

async function revokeSession(
  db: UserPrismaClient,
  auth: UserAuthContext,
  platform = false,
): Promise<void> {
  const sessionId = auth.claims.session_id;
  if (!sessionId) throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
  const repository = platform ? db.platformAuthSession : db.authSession;
  if (!repository.updateMany) throw new ServiceError(503, "Sessão não configurada.");
  const where = platform
    ? { id: sessionId, platform_user_id: auth.userId, revoked_at: null }
    : { id: sessionId, user_id: auth.userId, revoked_at: null };
  const revoked = await repository.updateMany({ where, data: { revoked_at: new Date() } });
  if (revoked.count !== 1) throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
}

async function refreshPlatformSession(
  db: UserPrismaClient,
  auth: UserAuthContext,
  identity: PlatformIdentity,
  env: UserWorkerEnv,
): Promise<{ identity: PlatformIdentity; token: string; csrfToken: string }> {
  const sessionId = auth.claims.session_id;
  const sessionVersion = auth.claims.session_version;
  const csrfHash = auth.claims.csrf_hash;
  if (!sessionId || !Number.isSafeInteger(sessionVersion) || typeof csrfHash !== "string") {
    throw new ServiceError(401, "Não autenticado.");
  }
  if (!db.platformAuthSession.updateMany) throw new ServiceError(503, "Sessão não configurada.");

  const nextCsrfToken = createCsrfToken();
  const nextCsrfHash = await hashCsrfToken(nextCsrfToken);
  const updated = await db.platformAuthSession.updateMany({
    where: {
      id: sessionId,
      platform_user_id: auth.userId,
      csrf_hash: csrfHash,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
    data: {
      csrf_hash: nextCsrfHash,
      expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  if (updated.count !== 1) {
    const currentSession = await db.platformAuthSession.findFirst({
      where: { id: sessionId, platform_user_id: auth.userId, revoked_at: null },
      select: { csrf_hash: true },
    });
    if (currentSession?.csrf_hash !== csrfHash) {
      throw new ServiceError(409, "Sessão substituída por uma renovação mais recente.");
    }
    throw new ServiceError(401, "Não autenticado.");
  }

  const token = await signSessionToken(
    {
      user_id: identity.id,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: sessionVersion,
      session_id: sessionId,
      csrf_hash: nextCsrfHash,
      name: identity.name,
      login: identity.email,
    },
    env.JWT_SECRET,
  );
  return { identity, token, csrfToken: nextCsrfToken };
}

const USER_MUTABLE_FIELDS = [
  "name",
  "login",
  "department_id",
  "permission",
  "status",
  "photo_url",
  "type",
  "first_owner_flag",
] as const;

/** Checa o alvo antes do storage: senão a foto do owner seria trocada antes do 403. */
async function assertPhotoTarget(
  db: UserPrismaClient,
  auth: UserAuthContext,
  userId: string,
): Promise<void> {
  const target = await db.user.findFirst({
    where: organizationUserWhere(userId, auth.organizationId),
    select: { type: true },
  });
  assertCanManageTarget(auth, target);
}

/** Criar ou promover owner é só do owner. Módulos seguem o teto de assertModulesWithinActor. */
function isOwnerMutation(input: Record<string, unknown>): boolean {
  return input.type === "owner" || input.first_owner_flag === true;
}

async function updateOrganizationUser(
  db: UserPrismaClient,
  userId: string,
  organizationId: string,
  input: Record<string, unknown>,
  hashPassword: (password: string) => Promise<string> = defaultHashPassword,
  actor?: UserAuthContext,
): Promise<Row> {
  const existing = await db.user.findFirst({
    where: organizationUserWhere(userId, organizationId),
    select: userSelect(),
  });
  if (!existing) throw new ServiceError(404, "Usuario nao encontrado.");
  if (actor) assertCanManageTarget(actor, existing);
  if (input.organization_id !== undefined && input.organization_id !== organizationId) {
    throw new ServiceError(403, "Organizacao da requisicao nao confere.");
  }

  const expectedVersion =
    typeof input.expected_version === "number"
      ? input.expected_version
      : Number(existing.version ?? 1);
  const data: Record<string, unknown> = {};
  if (input.department_id !== undefined) {
    await requireDepartmentInOrganization(db, String(input.department_id), organizationId);
  }
  for (const field of USER_MUTABLE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  const requestedType = input.type !== undefined ? input.type : existing.type;
  if (input.permission !== undefined) {
    data.permission = normalizePermissionForType(requestedType, Number(input.permission));
  }
  if (input.type !== undefined && input.type !== null) {
    if (input.permission === undefined && input.type === "owner") data.permission = 2;
    else if (
      input.permission === undefined &&
      (input.type === "admin" || input.type === "user") &&
      Number(existing.permission ?? 0) >= OWNER_GLOBAL_PERMISSION
    ) {
      data.permission = DEFAULT_NON_OWNER_PERMISSION;
    }
    if (input.type !== "owner" && existing.first_owner_flag === true) {
      data.first_owner_flag = false;
    }
  }
  const modules = input.modules as Record<string, number> | undefined;
  let modulesToApply: Record<string, number> | null = null;
  let normalizationDepartmentName: unknown;
  const modulePatch = modules
    ? Object.fromEntries(
        ACTIVE_MODULE_KEYS.filter((key) => modules[key] !== undefined).map((key) => [
          key,
          modules[key],
        ]),
      )
    : undefined;
  const normalizesTypeOrPermission =
    input.type !== undefined || input.permission !== undefined || input.department_id !== undefined;
  if (requestedType === "admin" && normalizesTypeOrPermission) {
    const department = await requireDepartmentInOrganization(
      db,
      String(input.department_id ?? existing.department_id),
      organizationId,
    );
    normalizationDepartmentName = department.name;
  }
  if (input.type === "owner" && (input.type === "owner" || input.first_owner_flag === true)) {
    modulesToApply = { ...MAX_MODULES };
  } else if (modulePatch) {
    // Paridade com o Node: módulos enviados vencem; admin mantém o módulo do departamento.
    modulesToApply = { ...modulePatch };
    const departmentModuleName =
      requestedType === "admin" && normalizesTypeOrPermission
        ? departmentModule(normalizationDepartmentName)
        : undefined;
    if (departmentModuleName) modulesToApply[departmentModuleName] = MAX_MODULE_PERMISSION;
  } else if (normalizesTypeOrPermission) {
    const effectivePermission =
      typeof data.permission === "number"
        ? data.permission
        : normalizePermissionForType(requestedType, Number(existing.permission ?? 0));
    modulesToApply = normalizedModulesForNonOwner(
      requestedType,
      effectivePermission,
      normalizationDepartmentName,
      input.status ?? existing.status,
    );
  }
  if (input.password !== undefined) {
    data.password = await hashPassword(String(input.password));
  }

  const run = async (transaction: UserPrismaClient): Promise<Row> => {
    const currentType = existing.type;
    const removesActiveOwner =
      currentType === "owner" &&
      existing.status === "active" &&
      ((input.type !== undefined && input.type !== "owner") || input.status === "inactive");
    if (removesActiveOwner) {
      const activeOwners = await transaction.user.count({
        where: { ...organizationUsersWhere(organizationId), type: "owner", status: "active" },
      });
      if (activeOwners <= 1) {
        throw new ServiceError(
          409,
          "Nao e possivel remover o ultimo owner ativo. Use a transferencia de ownership.",
        );
      }
    }

    const effectivePermission =
      typeof data.permission === "number"
        ? data.permission
        : normalizePermissionForType(
            String(input.type ?? existing.type),
            Number(existing.permission ?? 0),
          );
    if (
      modulesToApply &&
      (input.status ?? existing.status) === "active" &&
      effectivePermission >= DEFAULT_NON_OWNER_PERMISSION
    ) {
      modulesToApply = withDefaultSelfServiceModules(modulesToApply, effectivePermission);
    }
    if (actor && modulesToApply) assertModulesWithinActor(actor, modulesToApply);
    if (modulesToApply && Object.keys(modulesToApply).length > 0) {
      const permissionUpdate = await transaction.permission.updateMany({
        where: { user_id: userId, organization_id: organizationId },
        data: modulesToApply,
      });
      if (permissionUpdate.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
    }
    const sessionInvalidation =
      input.password !== undefined ||
      input.status === "inactive" ||
      input.permission !== undefined ||
      input.type !== undefined ||
      input.modules !== undefined;
    data.version = { increment: 1 };
    if (sessionInvalidation) data.session_version = { increment: 1 };
    if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
    const updated = await transaction.user.updateMany({
      where: { ...organizationUserWhere(userId, organizationId), version: expectedVersion },
      data,
    });
    if (updated.count !== 1) {
      throw new ServiceError(
        409,
        "Usuario foi alterado por outra edicao. Recarregue e tente novamente.",
      );
    }
    return toUser(
      {
        ...existing,
        ...Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== "version" && key !== "session_version"),
        ),
        version: expectedVersion + 1,
      },
      organizationId,
    );
  };

  if (!db.$transaction) {
    throw new ServiceError(503, "Atualização de usuário não configurada com transação.");
  }
  return db.$transaction(run, { isolationLevel: "Serializable" });
}

async function deactivateOrganizationUser(
  db: UserPrismaClient,
  userId: string,
  organizationId: string,
  actor?: UserAuthContext,
): Promise<void> {
  if (!db.$transaction) {
    throw new ServiceError(503, "Desativação de usuário não configurada com transação.");
  }
  await db.$transaction(
    async (transaction) => {
      const existing = await transaction.user.findFirst({
        where: organizationUserWhere(userId, organizationId),
        select: userSelect(),
      });
      if (!existing) throw new ServiceError(404, "Usuario nao encontrado.");
      if (actor) assertCanManageTarget(actor, existing);
      if (existing.type === "owner" && existing.status === "active") {
        const owners = await transaction.user.count({
          where: { ...organizationUsersWhere(organizationId), type: "owner", status: "active" },
        });
        if (owners <= 1) {
          throw new ServiceError(
            409,
            "Nao e possivel remover o ultimo owner ativo. Use a transferencia de ownership.",
          );
        }
      }
      if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
      const updated = await transaction.user.updateMany({
        where: {
          ...organizationUserWhere(userId, organizationId),
          version: existing.version ?? 1,
        },
        data: { status: "inactive", session_version: { increment: 1 }, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ServiceError(
          409,
          "Usuario foi alterado por outra edicao. Recarregue e tente novamente.",
        );
      }
    },
    { isolationLevel: "Serializable" },
  );
}

async function transferOwnership(
  db: UserPrismaClient,
  organizationId: string,
  input: {
    currentOwnerId: string;
    successorUserId: string;
    previousOwnerAction: "demote" | "deactivate";
  },
): Promise<{ currentOwner: Row; successor: Row }> {
  if (!db.$transaction) throw new ServiceError(503, "Transferência de ownership não configurada.");
  if (input.currentOwnerId === input.successorUserId) {
    throw new ServiceError(400, "O sucessor deve ser diferente do owner atual.");
  }
  return db.$transaction(
    async (transaction) => {
      const select = { ...userSelect(), session_version: true };
      const currentOwner = await transaction.user.findFirst({
        where: organizationUserWhere(input.currentOwnerId, organizationId),
        select,
      });
      if (!currentOwner) throw new ServiceError(404, "Owner atual não encontrado na organização.");
      if (currentOwner.type !== "owner" || currentOwner.status !== "active") {
        throw new ServiceError(409, "O usuário selecionado não é um owner ativo.");
      }
      const successor = await transaction.user.findFirst({
        where: organizationUserWhere(input.successorUserId, organizationId),
        select,
      });
      if (!successor) throw new ServiceError(404, "Sucessor não encontrado na organização.");
      if (successor.status !== "active")
        throw new ServiceError(409, "O sucessor precisa estar ativo.");
      if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");

      const currentOwnerStatus = input.previousOwnerAction === "deactivate" ? "inactive" : "active";
      let demotedModules = { ...EMPTY_MODULES };
      if (currentOwnerStatus === "active") {
        const department = await requireDepartmentInOrganization(
          transaction,
          String(currentOwner.department_id),
          organizationId,
        );
        demotedModules = normalizedModulesForNonOwner("admin", 1, department.name);
      }
      const demotedPermission = await transaction.permission.updateMany({
        where: { user_id: String(currentOwner.id), organization_id: organizationId },
        data: demotedModules,
      });
      if (demotedPermission.count !== 1) {
        throw new ServiceError(404, "Permissão não encontrada.");
      }

      const promoted = await transaction.user.updateMany({
        where: {
          ...organizationUserWhere(String(successor.id), organizationId),
          version: successor.version,
        },
        data: {
          type: "owner",
          permission: 2,
          session_version: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (promoted.count !== 1) {
        throw new ServiceError(409, "O sucessor foi alterado por outra edição. Tente novamente.");
      }

      const demoted = await transaction.user.updateMany({
        where: {
          ...organizationUserWhere(String(currentOwner.id), organizationId),
          version: currentOwner.version,
        },
        data: {
          type: "admin",
          permission: 1,
          status: currentOwnerStatus,
          session_version: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (demoted.count !== 1) {
        throw new ServiceError(
          409,
          "O owner atual foi alterado por outra edição. Tente novamente.",
        );
      }

      const activeOwners = await transaction.user.count({
        where: { ...organizationUsersWhere(organizationId), type: "owner", status: "active" },
      });
      if (activeOwners < 1)
        throw new ServiceError(409, "A organização deve manter ao menos um owner ativo.");
      return {
        currentOwner: toUser(
          {
            ...currentOwner,
            type: "admin",
            permission: 1,
            status: currentOwnerStatus,
            version: Number(currentOwner.version ?? 1) + 1,
          },
          organizationId,
        ),
        successor: toUser(
          {
            ...successor,
            type: "owner",
            permission: 2,
            version: Number(successor.version ?? 1) + 1,
          },
          organizationId,
        ),
      };
    },
    { isolationLevel: "Serializable" },
  );
}

async function updatePermissionAtomically(
  db: UserPrismaClient,
  userId: string,
  organizationId: string,
  modules: Record<string, number>,
  actor?: UserAuthContext,
): Promise<Row | null> {
  if (!db.$transaction) {
    throw new ServiceError(503, "Atualização de permissões não configurada com transação.");
  }
  if (actor) assertModulesWithinActor(actor, modules);
  return db.$transaction(
    async (transaction) => {
      if (actor) {
        const target = await transaction.user.findFirst({
          where: organizationUserWhere(userId, organizationId),
          select: { type: true },
        });
        assertCanManageTarget(actor, target);
      }
      const updated = await transaction.permission.updateMany({
        where: { user_id: userId, organization_id: organizationId },
        data: modules,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
      if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
      const session = await transaction.user.updateMany({
        where: organizationUserWhere(userId, organizationId),
        data: { session_version: { increment: 1 } },
      });
      if (session.count !== 1) {
        throw new ServiceError(409, "Usuário foi alterado por outra edição. Tente novamente.");
      }
      return transaction.permission.findFirst({
        where: { user_id: userId, organization_id: organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
    },
    { isolationLevel: "Serializable" },
  );
}

async function authFor(
  c: { req: { raw: Request }; env: UserWorkerEnv },
  options: UserWorkerOptions,
) {
  return authenticateUserRequest(c.req.raw, envOf(c, options));
}

async function platformContext(
  c: { req: { raw: Request; header(name: string): string | undefined }; env: UserWorkerEnv },
  options: UserWorkerOptions,
  db: UserPrismaClient,
): Promise<{ auth: UserAuthContext; identity: PlatformIdentity }> {
  requirePlatformGatewayAuthorization(c.req.raw, envOf(c, options));
  const auth = await authFor(c, options);
  return { auth, identity: await validatePlatformSession(auth, db) };
}

async function createOrganizationSession(
  db: UserPrismaClient,
  input: { login: string; password: string },
  options: UserWorkerOptions,
  env: UserWorkerEnv,
): Promise<Row & { token: string; csrfToken: string }> {
  const verifyPassword = options.verifyPassword ?? defaultVerifyPassword;
  const user = await db.user.findFirst({
    where: { login: input.login.trim() },
    select: {
      ...userSelect(),
      password: true,
      session_version: true,
      organization: { select: { id: true, status: true } },
      department: {
        select: {
          organization_id: true,
          organization: { select: { id: true, status: true } },
        },
      },
    },
  });
  const valid = await verifyPassword(input.password, String(user?.password ?? ""));
  const organizationId = user ? activeOrganizationId(user) : undefined;
  if (!user || !valid || user.status !== "active" || !organizationId) {
    throw new ServiceError(401, "Login ou senha inválidos.");
  }
  if (isLegacyBcryptHash(String(user.password ?? "")) && db.user.updateMany) {
    const rehashedPassword = await (options.hashPassword ?? defaultHashPassword)(input.password);
    await db.user.updateMany({
      where: { ...organizationUserWhere(String(user.id), organizationId), password: user.password },
      data: { password: rehashedPassword },
    });
  }
  const permission = await db.permission.findFirst({
    where: { user_id: user.id, organization_id: organizationId },
    select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
  });
  const csrfToken = createCsrfToken();
  const csrfHash = await hashCsrfToken(csrfToken);
  const sessionId = crypto.randomUUID();
  if (!db.authSession.create) throw new ServiceError(503, "Sessão não configurada.");
  await db.authSession.create({
    data: {
      id: sessionId,
      user_id: user.id,
      csrf_hash: csrfHash,
      expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  const modules = normalizeModulePermissions(permission);
  const token = await signSessionToken(
    {
      user_id: user.id,
      organization_id: organizationId,
      name: user.name,
      login: user.login,
      permission: user.permission,
      type: user.type,
      session_version: user.session_version,
      session_id: sessionId,
      modules,
      csrf_hash: csrfHash,
    },
    env.JWT_SECRET,
  );
  return { ...sessionUserData(user, organizationId, modules), token, csrfToken };
}

async function createPlatformSession(
  db: UserPrismaClient,
  input: { email: string; password: string },
  options: UserWorkerOptions,
  env: UserWorkerEnv,
): Promise<{ identity: PlatformIdentity; token: string; csrfToken: string }> {
  const verifyPassword = options.verifyPassword ?? defaultVerifyPassword;
  const user = await db.platformUser.findFirst({
    where: { email: input.email.trim().toLowerCase() },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      platform_role: true,
      status: true,
      session_version: true,
    },
  });
  const valid = await verifyPassword(input.password, String(user?.password ?? ""));
  if (!user || !valid || user.status !== "active" || user.platform_role !== "super_admin") {
    throw new ServiceError(401, "Login ou senha inválidos.");
  }
  const identity: PlatformIdentity = {
    id: user.id as string,
    name: user.name as string,
    email: user.email as string,
    auth_kind: "platform",
    platform_role: "super_admin",
  };
  const csrfToken = createCsrfToken();
  const csrfHash = await hashCsrfToken(csrfToken);
  const sessionId = crypto.randomUUID();
  if (!db.platformAuthSession.create) throw new ServiceError(503, "Sessão não configurada.");
  await db.platformAuthSession.create({
    data: {
      id: sessionId,
      platform_user_id: user.id,
      csrf_hash: csrfHash,
      expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  const token = await signSessionToken(
    {
      user_id: user.id,
      auth_kind: "platform",
      platform_role: "super_admin",
      session_version: user.session_version,
      session_id: sessionId,
      csrf_hash: csrfHash,
      name: user.name,
      login: user.email,
    },
    env.JWT_SECRET,
  );
  return { identity, token, csrfToken };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function createOrganizationUser(
  db: UserPrismaClient,
  organizationId: string,
  input: Record<string, unknown>,
  hashPassword: (password: string) => Promise<string>,
  actor?: UserAuthContext,
): Promise<Row> {
  const department = await requireDepartmentInOrganization(
    db,
    String(input.department_id),
    organizationId,
  );
  if (!db.user.create || !db.permission.create) {
    throw new ServiceError(503, "Criação de usuário não configurada.");
  }
  const type = input.type ?? null;
  const requestedPermission = Number(input.permission);
  const permission =
    type === "owner" ? 2 : type === "admin" && requestedPermission >= 2 ? 1 : requestedPermission;
  const modules = modulesForCreate(type, permission, department.name, input.modules);
  if (actor) assertModulesWithinActor(actor, modules);
  const password = await hashPassword(String(input.password));

  const run = async (transaction: UserPrismaClient): Promise<Row> => {
    if (!transaction.user.create || !transaction.permission.create) {
      throw new ServiceError(503, "Criação de usuário não configurada.");
    }
    const created = await transaction.user.create({
      data: {
        name: String(input.name),
        login: String(input.login),
        password,
        department_id: String(input.department_id),
        permission,
        status: input.status ?? "active",
        photo_url: input.photo_url,
        invited_by: input.invited_by,
        organization_id: organizationId,
        type,
        first_owner_flag: input.first_owner_flag ?? false,
      },
      select: userSelect(),
    });
    const createdPermission = await transaction.permission.create({
      data: { user_id: created.id, organization_id: organizationId },
      select: { id: true },
    });
    if (Object.keys(modules).length > 0) {
      const updatedPermission = await transaction.permission.updateMany({
        where: { id: createdPermission.id },
        data: modules,
      });
      if (updatedPermission.count !== 1) {
        throw new ServiceError(503, "Permissão não configurada.");
      }
    }
    if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
    await transaction.user.updateMany({
      where: { id: created.id, organization_id: organizationId },
      data: { permission_id: createdPermission.id },
    });
    return toUser({ ...created, permission_id: createdPermission.id }, organizationId);
  };

  try {
    return await (db.$transaction ? db.$transaction(run) : run(db));
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError(409, "Login já cadastrado.");
    throw error;
  }
}

async function createInitialUser(
  db: UserPrismaClient,
  env: UserWorkerEnv,
  hashPassword: (password: string) => Promise<string>,
): Promise<Row> {
  if (await db.user.findFirst({})) throw new ServiceError(409, "Login já cadastrado.");
  if (!env.ADMIN_PASSWORD) throw new ServiceError(503, "Senha inicial não configurada.");
  const organization = await db.organization.findFirst({});
  if (!organization?.id) {
    throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
  }
  if (!db.department.findFirst) throw new ServiceError(400, "Departamento não configurado.");
  const department = await db.department.findFirst({
    where: { organization_id: organization.id },
    select: { id: true, name: true, organization_id: true },
  });
  if (!department?.id) {
    throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
  }
  if (!db.user.create) throw new ServiceError(503, "Criação de usuário não configurada.");
  try {
    const password = await hashPassword(env.ADMIN_PASSWORD);
    const user = await db.user.create({
      data: {
        name: "Admin",
        login: "Admin",
        password,
        permission: 2,
        type: "owner",
        status: "active",
        department_id: department.id,
        organization_id: null,
        first_owner_flag: true,
      },
      select: {
        id: true,
        name: true,
        login: true,
        permission: true,
        department_id: true,
        organization_id: true,
      },
    });
    return user;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError(409, "Login já cadastrado.");
    throw error;
  }
}

async function requireUserDb(
  c: { req: { raw: Request }; env: UserWorkerEnv },
  options: UserWorkerOptions,
): Promise<{ auth: UserAuthContext; db: UserPrismaClient }> {
  const auth = await authFor(c, options);
  requireOrganizationAuth(auth);
  if (options.prisma) {
    await validateUserSession(auth, options.prisma);
    return { auth, db: options.prisma };
  }
  throw new ServiceError(503, "Banco de dados não configurado.");
}

export function createUserWorkerApp(options: UserWorkerOptions = {}) {
  const app = new Hono<HonoEnv>();

  app.get("/health", () =>
    Response.json(createSuccessResponse({ status: "ok", service: "user-service" })),
  );
  app.get("/ready", () =>
    Response.json(createSuccessResponse({ status: "ready", service: "user-service" })),
  );

  app.post("/user/start-config", async (c) =>
    withDb(c, options, async (db) => {
      const user = await createInitialUser(
        db,
        envOf(c, options),
        options.hashPassword ?? defaultHashPassword,
      );
      return c.json(createSuccessResponse({ user, service: "user-service" }));
    }),
  );

  app.post("/user/session", async (c) =>
    withDb(c, options, async (db) => {
      const input = parse(loginBodySchema, await jsonBody(c));
      const issued = await createOrganizationSession(db, input, options, envOf(c, options));
      sessionCookies(
        c,
        createSessionCookieHeaders(issued.token, issued.csrfToken, {
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      const { token: _token, csrfToken: _csrfToken, ...sessionUser } = issued;
      return c.json(createSuccessResponse({ ...sessionUser, service: "user-service" }));
    }),
  );

  app.post("/platform/session", async (c) => {
    requirePlatformGatewayAuthorization(c.req.raw, envOf(c, options), true);
    return withDb(c, options, async (db) => {
      const input = parse(platformLoginBodySchema, await jsonBody(c));
      const issued = await createPlatformSession(db, input, options, envOf(c, options));
      sessionCookies(
        c,
        createSessionCookieHeaders(issued.token, issued.csrfToken, {
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      return c.json(createSuccessResponse(issued.identity));
    });
  });

  app.post("/user/session/refresh", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      const issued = await refreshOrganizationSession(db, auth, envOf(c, options));
      sessionCookies(
        c,
        createSessionCookieHeaders(issued.token, issued.csrfToken, {
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      const { token: _token, csrfToken: _csrfToken, ...sessionUser } = issued;
      return c.json(createSuccessResponse({ ...sessionUser, service: "user-service" }));
    }),
  );

  app.delete("/user/session", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      await revokeSession(db, auth);
      sessionCookies(
        c,
        createExpiredSessionCookieHeaders({
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      return c.json(createSuccessResponse({ loggedOut: true }));
    }),
  );

  app.post("/internal/reporting/access-context", async (c) => {
    const env = envOf(c, options);
    if (
      !env.REPORTS_INTERNAL_TOKEN ||
      c.req.header("x-internal-service-token") !== env.REPORTS_INTERNAL_TOKEN
    ) {
      throw new ServiceError(403, "Acesso negado.");
    }
    return withDb(c, options, async (db) => {
      const input = parse(reportingAccessContextBodySchema, await jsonBody(c));
      const user = (await db.user.findFirst({
        where: {
          ...organizationUserWhere(input.userId, input.organizationId),
          department: { organization_id: input.organizationId },
        },
        select: {
          id: true,
          name: true,
          login: true,
          type: true,
          department: {
            select: {
              id: true,
              name: true,
              organization: { select: { id: true, name: true } },
            },
          },
        },
      })) as
        | (Row & {
            department: {
              id: string;
              name: string | null;
              organization: { id: string; name: string };
            };
          })
        | null;
      if (!user) throw new ServiceError(404, "Usuario nao encontrado.");
      const permission = await db.permission.findFirst({
        where: { user_id: input.userId, organization_id: input.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      return c.json(
        createSuccessResponse({
          user: { id: user.id, name: user.name, login: user.login },
          organization: user.department.organization,
          type:
            user.type === "owner" || user.type === "admin" || user.type === "user"
              ? user.type
              : null,
          department: { id: user.department.id, name: user.department.name ?? null },
          departmentModule: departmentModule(user.department.name),
          modules: normalizeModulePermissions(permission),
        }),
      );
    });
  });

  app.get("/user/session/validate", async (c) => {
    const auth = await authFor(c, options);
    if (c.req.header("x-internal-service-token") !== envOf(c, options).INTERNAL_SERVICE_TOKEN) {
      throw new ServiceError(403, "Acesso negado.");
    }
    return withDb(c, options, async (db) => {
      await validateUserSession(auth, db);
      return c.json(createSuccessResponse({ valid: true }));
    });
  });

  app.get("/user/me", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      const row = await db.user.findFirst({
        where: organizationUserWhere(auth.userId, auth.organizationId),
        select: userSelect(),
      });
      if (!row) throw new ServiceError(404, "Usuário não encontrado.");
      const permission = await db.permission.findFirst({
        where: { user_id: auth.userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      const specific = await db.permissionSpecific.findFirst({
        where: { user_id: auth.userId, organization_id: auth.organizationId },
        select: { task_completion: true },
      });
      return c.json(
        createSuccessResponse({
          ...toUser(row, auth.organizationId),
          modules: modulesFrom(permission),
          task_completion: specific?.task_completion === true,
          service: "user-service",
        }),
      );
    }),
  );

  app.get("/user", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { skip, take } = parse(listUsersQuerySchema, c.req.query());
      const where = organizationUsersWhere(auth.organizationId);
      const [users, total] = await Promise.all([
        db.user.findMany({ where, select: userSelect(), skip, take, orderBy: { name: "asc" } }),
        db.user.count({ where }),
      ]);
      return c.json(createSuccessResponse({ users, total, skip, take }));
    }),
  );

  app.post("/user", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const input = parse(createUserBodySchema, await jsonBody(c)) as Record<string, unknown>;
      if (input.organization_id !== undefined && input.organization_id !== auth.organizationId) {
        throw new ServiceError(403, "Organizacao da requisicao nao confere.");
      }
      if (isOwnerMutation(input)) requireOwner(auth);
      let user: Row;
      try {
        user = await createOrganizationUser(
          db,
          auth.organizationId,
          input,
          options.hashPassword ?? defaultHashPassword,
          auth,
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new ServiceError(409, "Login já cadastrado.");
        throw error;
      }
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "CREATE",
        referring: "user",
        referringId: String(user.id),
        changes: { next: user },
      });
      return c.json(createSuccessResponse(user), 201);
    }),
  );

  app.get("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const row = await db.user.findFirst({
        where: organizationUserWhere(id, auth.organizationId),
        select: { photo_url: true },
      });
      const objectPath = photoObjectPath(row?.photo_url);
      if (!objectPath || !objectPath.startsWith(`${id}/`) || objectPath.includes("..")) {
        throw new ServiceError(404, "Foto nao encontrada.");
      }
      const storage = userPhotoStorage(envOf(c, options), options);
      if (!storage) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
      return c.json(createSuccessResponse({ url: await signedPhotoUrl(storage, objectPath) }));
    }),
  );

  app.post("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      await assertPhotoTarget(db, auth, id);
      const { file, extension } = await parseUserPhoto(c);
      const storage = userPhotoStorage(envOf(c, options), options);
      if (!storage) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
      const objectPath = `${id}/photo.${extension}`;
      await requirePrivatePhotoBucket(storage);
      await storage.upload(USER_PHOTO_BUCKET, objectPath, file, {
        contentType: file.type,
        upsert: true,
      });
      const user = await updateOrganizationUser(db, id, auth.organizationId, {
        photo_url: objectPath,
      });
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "UPDATE_PHOTO",
        referring: "user",
        referringId: id,
        changes: { photo_url: objectPath },
      });
      return c.json(
        createSuccessResponse({
          ...user,
          photo_url: await signedPhotoUrl(storage, objectPath),
        }),
      );
    }),
  );

  app.delete("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      await assertPhotoTarget(db, auth, id);
      const storage = userPhotoStorage(envOf(c, options), options);
      if (!storage) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
      await requirePrivatePhotoBucket(storage);
      await storage.remove(USER_PHOTO_BUCKET, id);
      const user = await updateOrganizationUser(db, id, auth.organizationId, { photo_url: null });
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "REMOVE_PHOTO",
        referring: "user",
        referringId: id,
        changes: { photo_url: null },
      });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.get("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const row = await db.user.findFirst({
        where: organizationUserWhere(id, auth.organizationId),
        select: userSelect(),
      });
      if (!row) throw new ServiceError(404, "Usuário não encontrado.");
      return c.json(createSuccessResponse(toUser(row, auth.organizationId)));
    }),
  );

  app.put("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      const { id } = parse(userIdParamsSchema, c.req.param());
      const body = parse(updateUserBodySchema, await jsonBody(c)) as Record<string, unknown>;
      const selfPasswordUpdate =
        auth.userId === id && Object.keys(body).every((key) => key === "password");
      if (!selfPasswordUpdate) requireManageUsers(auth);
      if (isOwnerMutation(body)) requireOwner(auth);
      await requireCsrf(c.req.raw, auth);
      const user = await updateOrganizationUser(
        db,
        id,
        auth.organizationId,
        body,
        options.hashPassword ?? defaultHashPassword,
        selfPasswordUpdate ? undefined : auth,
      );
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "UPDATE",
        referring: "user",
        referringId: id,
        changes: { input: { ...body, password: body.password ? "[REDACTED]" : undefined } },
      });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.delete("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      await deactivateOrganizationUser(db, id, auth.organizationId, auth);
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "DEACTIVATE",
        referring: "user",
        referringId: id,
        changes: { status: "inactive" },
      });
      return c.json(createSuccessResponse({ message: "Usuario desativado com sucesso." }));
    }),
  );

  app.get("/user/permission/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { userId } = parse(permissionUserIdParamsSchema, c.req.param());
      const { modulo } = parse(permissionQuerySchema, c.req.query());
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      if (!permission) throw new ServiceError(404, "Permissão não encontrada.");
      if (modulo && Number(permission[modulo] ?? 0) === 0) {
        throw new ServiceError(403, `Usuário sem acesso ao módulo '${modulo}'.`);
      }
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.put("/user/permission/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const { userId } = parse(permissionUserIdParamsSchema, c.req.param());
      const modules = parse(updatePermissionBodySchema, await jsonBody(c));
      const permission = await updatePermissionAtomically(
        db,
        userId,
        auth.organizationId,
        modules,
        auth,
      );
      await options.audit?.({
        actorUserId: auth.userId,
        organizationId: auth.organizationId,
        action: "UPDATE",
        referring: "Permission",
        referringId: userId,
        changes: { modules },
      });
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.get("/platform/organizations/:organizationId/users/:userId/permissions", async (c) =>
    withDb(c, options, async (db) => {
      await platformContext(c, options, db);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: organizationId },
        select: {
          id: true,
          user_id: true,
          organization_id: true,
          ...Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
        },
      });
      if (!permission) throw new ServiceError(404, "Permissão não encontrada.");
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.put("/platform/organizations/:organizationId/users/:userId/permissions", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const modules = parse(updatePermissionBodySchema, await jsonBody(c));
      const permission = await updatePermissionAtomically(db, userId, organizationId, modules);
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "UPDATE",
        referring: "Permission",
        referringId: userId,
        changes: { modules },
      });
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.get("/platform/organizations/:organizationId/users/:userId", async (c) =>
    withDb(c, options, async (db) => {
      await platformContext(c, options, db);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const user = await db.user.findFirst({
        where: organizationUserWhere(userId, organizationId),
        select: userSelect(),
      });
      if (!user) throw new ServiceError(404, "Usuário não encontrado.");
      return c.json(createSuccessResponse(toUser(user, organizationId)));
    }),
  );

  app.post("/platform/organizations/:organizationId/users", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const input = parse(createUserBodySchema, await jsonBody(c)) as Record<string, unknown>;
      if (input.organization_id !== undefined && input.organization_id !== organizationId) {
        throw new ServiceError(403, "Organizacao da requisicao nao confere.");
      }
      const user = await createOrganizationUser(
        db,
        organizationId,
        input,
        options.hashPassword ?? defaultHashPassword,
      );
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "CREATE",
        referring: "user",
        referringId: String(user.id),
        changes: { next: user },
      });
      return c.json(createSuccessResponse(user), 201);
    }),
  );

  app.patch("/platform/organizations/:organizationId/users/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const input = parse(updatePlatformUserBodySchema, await jsonBody(c)) as Record<
        string,
        unknown
      >;
      const user = await updateOrganizationUser(
        db,
        userId,
        organizationId,
        input,
        options.hashPassword ?? defaultHashPassword,
      );
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "UPDATE",
        referring: "user",
        referringId: userId,
        changes: { input: { ...input, password: input.password ? "[REDACTED]" : undefined } },
      });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.delete("/platform/organizations/:organizationId/users/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const user = await db.user.findFirst({
        where: organizationUserWhere(userId, organizationId),
        select: userSelect(),
      });
      await deactivateOrganizationUser(db, userId, organizationId);
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "DEACTIVATE",
        referring: "user",
        referringId: userId,
        changes: { status: "inactive" },
      });
      return c.json(
        createSuccessResponse({
          ...toUser(user as Row, organizationId),
          status: "inactive",
          version: Number(user?.version ?? 1) + 1,
        }),
      );
    }),
  );

  app.post("/platform/organizations/:organizationId/users/:userId/reactivate", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const current = await db.user.findFirst({
        where: organizationUserWhere(userId, organizationId),
        select: userSelect(),
      });
      if (!current) throw new ServiceError(404, "Usuário não encontrado.");
      const user = await updateOrganizationUser(db, userId, organizationId, {
        status: "active",
        expected_version: current.version ?? 1,
      });
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "REACTIVATE",
        referring: "user",
        referringId: userId,
        changes: { status: "active" },
      });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.post("/platform/organizations/:organizationId/ownership-transfer", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const input = parse(transferPlatformOwnershipBodySchema, await jsonBody(c));
      const result = await transferOwnership(db, organizationId, input);
      await options.audit?.({
        platformActorUserId: auth.userId,
        organizationId,
        action: "TRANSFER_OWNERSHIP",
        referring: "user",
        referringId: input.successorUserId,
        changes: {
          currentOwnerId: input.currentOwnerId,
          previousOwnerAction: input.previousOwnerAction,
        },
      });
      return c.json(createSuccessResponse(result));
    }),
  );

  app.get("/platform/me", async (c) =>
    withDb(c, options, async (db) => {
      const { identity } = await platformContext(c, options, db);
      return c.json(createSuccessResponse(identity));
    }),
  );

  app.post("/platform/session/refresh", async (c) =>
    withDb(c, options, async (db) => {
      const { auth, identity } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const issued = await refreshPlatformSession(db, auth, identity, envOf(c, options));
      sessionCookies(
        c,
        createSessionCookieHeaders(issued.token, issued.csrfToken, {
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      return c.json(createSuccessResponse(issued.identity));
    }),
  );

  app.delete("/platform/session", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      await revokeSession(db, auth, true);
      sessionCookies(
        c,
        createExpiredSessionCookieHeaders({
          secure: envOf(c, options).AUTH_COOKIE_SECURE ?? false,
        }),
      );
      return c.json(createSuccessResponse({ loggedOut: true }));
    }),
  );

  const platformRead: MiddlewareHandler<HonoEnv> = async (c, next) => {
    return withDb(c, options, async (db) => {
      const { auth, identity } = await platformContext(c, options, db);
      c.set("auth", auth);
      c.set("platformIdentity", identity);
      await next();
    });
  };
  app.get("/platform/organizations/:organizationId/departments", platformRead, async (c) =>
    withDb(c, options, async (db) => {
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const departments = await db.department.findMany({
        where: { organization_id: organizationId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return c.json(createSuccessResponse(departments));
    }),
  );
  app.get("/platform/organizations/:organizationId/users", platformRead, async (c) =>
    withDb(c, options, async (db) => {
      const { organizationId } = parse(platformOrganizationUsersParamsSchema, c.req.param());
      const query = parse(listPlatformUsersQuerySchema, c.req.query());
      const search = query.search.trim();
      const where = {
        ...organizationUsersWhere(organizationId),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { login: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [users, total] = await Promise.all([
        db.user.findMany({
          where,
          select: userSelect(),
          skip: query.skip,
          take: query.take,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.user.count({ where }),
      ]);
      return c.json(
        createSuccessResponse({ users, total, hasMore: query.skip + users.length < total }),
      );
    }),
  );

  app.post("/platform/session/validate", async (c) =>
    withDb(c, options, async (db) => {
      const auth = await authenticatePlatformValidationRequest(c.req.raw, envOf(c, options));
      await validatePlatformSession(auth, db);
      return c.json(createSuccessResponse({ valid: true }));
    }),
  );

  app.notFound(() => errorResponse(new ServiceError(404, "Recurso não encontrado.")));
  app.onError((error, c) => {
    // Erro esperado vira resposta; o inesperado vira 500 generico e precisa ficar no log.
    if (!(error instanceof ServiceError)) {
      console.error("Erro inesperado no user-service", {
        requestId: c.req.header(REQUEST_ID_HEADER),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no user-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}
