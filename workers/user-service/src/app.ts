import {
  createCsrfToken,
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
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
import {
  ACTIVE_MODULE_KEYS,
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
  _env: UserWorkerEnv,
  options: UserWorkerOptions,
): SupabaseStorageClient | undefined {
  return options.storage;
}

function publicPhotoUrl(env: UserWorkerEnv, objectPath: string): string {
  if (!env.SUPABASE_URL) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
  const path = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${env.SUPABASE_URL.replace(/\/+$/u, "")}/storage/v1/object/public/${USER_PHOTO_BUCKET}/${path}`;
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
    where: { id: auth.userId, organization_id: auth.organizationId },
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

function isOwnerMutation(input: Record<string, unknown>): boolean {
  return input.type === "owner" || input.first_owner_flag === true || input.modules !== undefined;
}

async function updateOrganizationUser(
  db: UserPrismaClient,
  userId: string,
  organizationId: string,
  input: Record<string, unknown>,
): Promise<Row> {
  const existing = await db.user.findFirst({
    where: { id: userId, organization_id: organizationId },
    select: userSelect(),
  });
  if (!existing) throw new ServiceError(404, "Usuario nao encontrado.");
  if (input.organization_id !== undefined && input.organization_id !== organizationId) {
    throw new ServiceError(403, "Organizacao da requisicao nao confere.");
  }

  const expectedVersion =
    typeof input.expected_version === "number"
      ? input.expected_version
      : Number(existing.version ?? 1);
  const data: Record<string, unknown> = {};
  for (const field of USER_MUTABLE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }
  if (input.type !== undefined && input.type !== null) {
    if (input.permission !== undefined) data.permission = input.permission;
    else if (input.type === "owner") data.permission = 2;
  }
  const modules = input.modules as Record<string, number> | undefined;
  const modulePatch = modules
    ? Object.fromEntries(
        ACTIVE_MODULE_KEYS.filter((key) => modules[key] !== undefined).map((key) => [
          key,
          modules[key],
        ]),
      )
    : undefined;
  if (input.password !== undefined) {
    throw new ServiceError(501, "A troca de senha requer o adapter de hash do user-service.");
  }

  const run = async (transaction: UserPrismaClient): Promise<Row> => {
    if (modulePatch && Object.keys(modulePatch).length > 0) {
      const permissionUpdate = await transaction.permission.updateMany({
        where: { user_id: userId, organization_id: organizationId },
        data: modulePatch,
      });
      if (permissionUpdate.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
    }
    const sessionInvalidation =
      input.status === "inactive" ||
      input.permission !== undefined ||
      input.type !== undefined ||
      input.modules !== undefined;
    data.version = { increment: 1 };
    if (sessionInvalidation) data.session_version = { increment: 1 };
    if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
    const updated = await transaction.user.updateMany({
      where: { id: userId, organization_id: organizationId, version: expectedVersion },
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

  return db.$transaction ? db.$transaction(run) : run(db);
}

async function deactivateOrganizationUser(
  db: UserPrismaClient,
  userId: string,
  organizationId: string,
): Promise<void> {
  const existing = await db.user.findFirst({
    where: { id: userId, organization_id: organizationId },
    select: userSelect(),
  });
  if (!existing) throw new ServiceError(404, "Usuario nao encontrado.");
  if (existing.type === "owner" && existing.status === "active") {
    const owners = await db.user.count({
      where: { organization_id: organizationId, type: "owner", status: "active" },
    });
    if (owners <= 1) {
      throw new ServiceError(
        409,
        "Nao e possivel remover o ultimo owner ativo. Use a transferencia de ownership.",
      );
    }
  }
  if (!db.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
  const updated = await db.user.updateMany({
    where: { id: userId, organization_id: organizationId, version: existing.version ?? 1 },
    data: { status: "inactive", session_version: { increment: 1 }, version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new ServiceError(
      409,
      "Usuario foi alterado por outra edicao. Recarregue e tente novamente.",
    );
  }
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
  return db.$transaction(async (transaction) => {
    const select = { ...userSelect(), session_version: true };
    const currentOwner = await transaction.user.findFirst({
      where: { id: input.currentOwnerId, organization_id: organizationId },
      select,
    });
    if (!currentOwner) throw new ServiceError(404, "Owner atual não encontrado na organização.");
    if (currentOwner.type !== "owner" || currentOwner.status !== "active") {
      throw new ServiceError(409, "O usuário selecionado não é um owner ativo.");
    }
    const successor = await transaction.user.findFirst({
      where: { id: input.successorUserId, organization_id: organizationId },
      select,
    });
    if (!successor) throw new ServiceError(404, "Sucessor não encontrado na organização.");
    if (successor.status !== "active")
      throw new ServiceError(409, "O sucessor precisa estar ativo.");
    if (!transaction.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");

    const promoted = await transaction.user.updateMany({
      where: {
        id: successor.id,
        organization_id: organizationId,
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
        id: currentOwner.id,
        organization_id: organizationId,
        version: currentOwner.version,
      },
      data: {
        type: "admin",
        permission: 1,
        status: input.previousOwnerAction === "deactivate" ? "inactive" : "active",
        session_version: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (demoted.count !== 1) {
      throw new ServiceError(409, "O owner atual foi alterado por outra edição. Tente novamente.");
    }

    const activeOwners = await transaction.user.count({
      where: { organization_id: organizationId, type: "owner", status: "active" },
    });
    if (activeOwners < 1)
      throw new ServiceError(409, "A organização deve manter ao menos um owner ativo.");
    return {
      currentOwner: toUser(
        {
          ...currentOwner,
          type: "admin",
          permission: 1,
          status: input.previousOwnerAction === "deactivate" ? "inactive" : "active",
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
  });
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
  if (!options.verifyPassword) {
    throw new ServiceError(501, "O login requer o adapter de hash do user-service.");
  }
  const user = await db.user.findFirst({
    where: { login: input.login.trim() },
    select: { ...userSelect(), password: true, session_version: true },
  });
  const valid = await options.verifyPassword(input.password, String(user?.password ?? ""));
  if (!user || !valid || user.status !== "active" || typeof user.organization_id !== "string") {
    throw new ServiceError(401, "Login ou senha inválidos.");
  }
  const permission = await db.permission.findFirst({
    where: { user_id: user.id, organization_id: user.organization_id },
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
      organization_id: user.organization_id,
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
  return { ...sessionUserData(user, user.organization_id, modules), token, csrfToken };
}

async function createPlatformSession(
  db: UserPrismaClient,
  input: { email: string; password: string },
  options: UserWorkerOptions,
  env: UserWorkerEnv,
): Promise<{ identity: PlatformIdentity; token: string; csrfToken: string }> {
  if (!options.verifyPassword) {
    throw new ServiceError(501, "O login de plataforma requer o adapter de hash do user-service.");
  }
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
  const valid = await options.verifyPassword(input.password, String(user?.password ?? ""));
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
    const reportsToken = env.REPORTS_INTERNAL_TOKEN ?? env.INTERNAL_SERVICE_TOKEN;
    if (c.req.header("x-internal-service-token") !== reportsToken) {
      throw new ServiceError(403, "Acesso negado.");
    }
    return withDb(c, options, async (db) => {
      const input = parse(reportingAccessContextBodySchema, await jsonBody(c));
      const user = (await db.user.findFirst({
        where: {
          id: input.userId,
          organization_id: input.organizationId,
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
        where: { id: auth.userId, organization_id: auth.organizationId },
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
      const where = { organization_id: auth.organizationId };
      const [users, total] = await Promise.all([
        db.user.findMany({ where, select: userSelect(), skip, take, orderBy: { name: "asc" } }),
        db.user.count({ where }),
      ]);
      return c.json(createSuccessResponse({ users, total, skip, take }));
    }),
  );

  app.get("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const row = await db.user.findFirst({
        where: { id, organization_id: auth.organizationId },
        select: { photo_url: true },
      });
      const photoUrl = typeof row?.photo_url === "string" ? row.photo_url.trim() : "";
      if (!photoUrl || !/^https?:\/\//iu.test(photoUrl)) {
        throw new ServiceError(404, "Foto nao encontrada.");
      }
      return c.json(createSuccessResponse({ url: photoUrl }));
    }),
  );

  app.post("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const { file, extension } = await parseUserPhoto(c);
      const storage = userPhotoStorage(envOf(c, options), options);
      if (!storage) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
      const objectPath = `${id}/photo.${extension}`;
      await storage.upload(USER_PHOTO_BUCKET, objectPath, file, {
        contentType: file.type,
        upsert: true,
      });
      const user = await updateOrganizationUser(db, id, auth.organizationId, {
        photo_url: publicPhotoUrl(envOf(c, options), objectPath),
      });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.delete("/user/:id/photo", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const storage = userPhotoStorage(envOf(c, options), options);
      if (!storage) throw new ServiceError(503, "Armazenamento de fotos não configurado.");
      await storage.remove(USER_PHOTO_BUCKET, id);
      const user = await updateOrganizationUser(db, id, auth.organizationId, { photo_url: null });
      return c.json(createSuccessResponse(user));
    }),
  );

  app.get("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      const row = await db.user.findFirst({
        where: { id, organization_id: auth.organizationId },
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
      const user = await updateOrganizationUser(db, id, auth.organizationId, body);
      return c.json(createSuccessResponse(user));
    }),
  );

  app.delete("/user/:id", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await requireUserDb(c, { ...options, prisma: db });
      requireManageUsers(auth);
      await requireCsrf(c.req.raw, auth);
      const { id } = parse(userIdParamsSchema, c.req.param());
      await deactivateOrganizationUser(db, id, auth.organizationId);
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
      requireOwner(auth);
      await requireCsrf(c.req.raw, auth);
      const { userId } = parse(permissionUserIdParamsSchema, c.req.param());
      const modules = parse(updatePermissionBodySchema, await jsonBody(c));
      const updated = await db.permission.updateMany({
        where: { user_id: userId, organization_id: auth.organizationId },
        data: modules,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
      await db.user.updateMany?.({
        where: { id: userId, organization_id: auth.organizationId },
        data: { session_version: { increment: 1 } },
      });
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: auth.organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
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
      const updated = await db.permission.updateMany({
        where: { user_id: userId, organization_id: organizationId },
        data: modules,
      });
      if (updated.count !== 1) throw new ServiceError(404, "Permissão não encontrada.");
      if (!db.user.updateMany) throw new ServiceError(503, "Usuário não configurado.");
      await db.user.updateMany({
        where: { id: userId, organization_id: organizationId },
        data: { session_version: { increment: 1 } },
      });
      const permission = await db.permission.findFirst({
        where: { user_id: userId, organization_id: organizationId },
        select: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, true])),
      });
      return c.json(createSuccessResponse(permission));
    }),
  );

  app.get("/platform/organizations/:organizationId/users/:userId", async (c) =>
    withDb(c, options, async (db) => {
      await platformContext(c, options, db);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const user = await db.user.findFirst({
        where: { id: userId, organization_id: organizationId },
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
      parse(createUserBodySchema, await jsonBody(c));
      throw new ServiceError(
        501,
        `A criação de usuário requer o adapter de hash do user-service para ${organizationId}.`,
      );
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
      const user = await updateOrganizationUser(db, userId, organizationId, input);
      return c.json(createSuccessResponse(user));
    }),
  );

  app.delete("/platform/organizations/:organizationId/users/:userId", async (c) =>
    withDb(c, options, async (db) => {
      const { auth } = await platformContext(c, options, db);
      await requireCsrf(c.req.raw, auth);
      const { organizationId, userId } = parse(platformOrganizationUserParamsSchema, c.req.param());
      const user = await db.user.findFirst({
        where: { id: userId, organization_id: organizationId },
        select: userSelect(),
      });
      await deactivateOrganizationUser(db, userId, organizationId);
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
        where: { id: userId, organization_id: organizationId },
        select: userSelect(),
      });
      if (!current) throw new ServiceError(404, "Usuário não encontrado.");
      const user = await updateOrganizationUser(db, userId, organizationId, {
        status: "active",
        expected_version: current.version ?? 1,
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
        organization_id: organizationId,
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
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no user-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });
  return app;
}
