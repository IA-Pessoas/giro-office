import { randomUUID } from "node:crypto";

import {
  ACTIVE_MODULE_KEYS,
  type AuthIdentity,
  type AuthUserType,
  createCsrfToken,
  hashCsrfToken,
  info,
  type ModulePermissionKey,
  type ModulePermissions,
  SESSION_MAX_AGE_SECONDS,
  ServiceError,
} from "@workspace/shared";
import jwt from "jsonwebtoken";

import { getUserServiceEnv } from "../config/env.js";
import prismaClient from "../prisma/index.js";
import {
  hashPassword,
  PASSWORD_HASH_VERSION,
  verifyPassword,
} from "../security/passwordHashService.js";

interface LoginRequest {
  login: string;
  password: string;
}

const MODULE_PERMISSION_KEYS: readonly ModulePermissionKey[] = ACTIVE_MODULE_KEYS;
const GENERIC_LOGIN_ERROR_MESSAGE = "Login ou senha inválidos.";
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$lktGNqJmnbIyj6tMoe+a8Q$HRtIIMh3LPpaIs9yyun/WOjqfivhgr4Nt3m9wsIkTsQ";
const CSRF_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SESSION_VALIDATION_USER_SELECT = {
  status: true,
  session_version: true,
  organization_id: true,
  organization: { select: { id: true, status: true } },
  department: {
    select: {
      organization_id: true,
      organization: { select: { id: true, status: true } },
    },
  },
} as const;

function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

interface PersistedAuthContext {
  status: string;
  session_version: number;
  organization_id: string | null;
  organization: { id: string; status: string } | null;
  department: {
    organization_id: string;
    organization: { id: string; status: string };
  };
}

interface SessionSource extends PersistedAuthContext {
  id: string;
  name: string;
  login: string;
  permission: number;
  type: string | null;
  department_id: string;
  permissions: Array<
    { organization_id: string } & Partial<Record<ModulePermissionKey, number | null>>
  >;
}

type LoginFailureReason =
  | "account_not_found"
  | "invalid_password"
  | "inactive_user"
  | "inactive_organization"
  | "invalid_membership";

function normalizeAuthUserType(value: unknown): AuthUserType | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function allowsOrganizationAuthentication(status: string): boolean {
  return status === "active" || status === "trial";
}

function getActiveOrganizationId(user: PersistedAuthContext): string | undefined {
  const organizationId = user.organization_id ?? user.department.organization_id;
  const organization = user.organization_id ? user.organization : user.department.organization;

  if (
    user.status !== "active" ||
    user.department.organization_id !== organizationId ||
    !organization ||
    organization.id !== organizationId ||
    !allowsOrganizationAuthentication(organization.status)
  ) {
    return undefined;
  }

  return organizationId;
}

function getLoginFailureReason(
  user: PersistedAuthContext | null,
  passwordMatch: boolean,
): LoginFailureReason | undefined {
  if (!user) {
    return "account_not_found";
  }
  if (!passwordMatch) {
    return "invalid_password";
  }
  if (user.status !== "active") {
    return "inactive_user";
  }

  const organizationId = user.organization_id ?? user.department.organization_id;
  const organization = user.organization_id ? user.organization : user.department.organization;
  if (
    user.department.organization_id !== organizationId ||
    !organization ||
    organization.id !== organizationId
  ) {
    return "invalid_membership";
  }
  if (!allowsOrganizationAuthentication(organization.status)) {
    return "inactive_organization";
  }

  return undefined;
}

function rejectLogin(reason: LoginFailureReason): never {
  info("Authentication rejected", { event: "auth.login.rejected", data: { reason } });
  throw new ServiceError(401, GENERIC_LOGIN_ERROR_MESSAGE);
}

export interface SessionUser {
  id: string;
  name: string;
  login: string;
  permission: number;
  type?: AuthUserType;
  modules: ModulePermissions;
  department_id: string;
  organization_id: string;
}

export interface IssuedSession extends SessionUser {
  token: string;
  csrfToken: string;
}

export interface FirstCreateResult {
  user: {
    id: string;
    name: string;
    login: string;
    permission: number;
    department_id: string;
  };
}

class AuthService {
  private issueSession(
    user: SessionSource,
    organizationId: string,
    sessionId: string,
    csrfToken: string,
  ): IssuedSession {
    const permissionRecord = user.permissions.find(
      (permission) => permission.organization_id === organizationId,
    );
    const modules = MODULE_PERMISSION_KEYS.reduce<ModulePermissions>((acc, key) => {
      acc[key] = permissionRecord?.[key] ?? 0;
      return acc;
    }, {} as ModulePermissions);
    const type = normalizeAuthUserType(user.type);
    const token = jwt.sign(
      {
        user_id: user.id,
        organization_id: organizationId,
        name: user.name,
        login: user.login,
        permission: user.permission,
        type,
        session_version: user.session_version,
        session_id: sessionId,
        modules,
        csrf_hash: hashCsrfToken(csrfToken),
      },
      getUserServiceEnv().jwtSecret,
      {
        subject: user.id,
        expiresIn: SESSION_MAX_AGE_SECONDS,
      },
    );

    return {
      id: user.id,
      name: user.name,
      login: user.login,
      permission: user.permission,
      type,
      modules,
      department_id: user.department_id,
      organization_id: organizationId,
      token,
      csrfToken,
    };
  }

  async login({ login, password }: LoginRequest): Promise<IssuedSession> {
    const normalizedLogin = login.trim();
    // ponytail: users_login_key is case-sensitive, so legacy "Ana" + "ana" would both match;
    // add a unique index on lower(login) if that ever collides.
    const user = await prismaClient.user.findFirst({
      where: { login: { equals: normalizedLogin, mode: "insensitive" } },
      include: {
        organization: { select: { id: true, status: true } },
        department: {
          select: {
            organization_id: true,
            organization: { select: { id: true, status: true } },
          },
        },
        permissions: true,
      },
    });

    const passwordVerification = await verifyPassword(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );
    const failureReason = getLoginFailureReason(user, passwordVerification.valid);
    if (failureReason || !user) {
      rejectLogin(failureReason ?? "account_not_found");
    }
    const organizationId = getActiveOrganizationId(user);
    if (!organizationId) {
      rejectLogin("invalid_membership");
    }

    if (passwordVerification.needsRehash) {
      const passwordHash = await hashPassword(password);
      const { count } = await prismaClient.user.updateMany({
        where: { id: user.id, password: user.password },
        data: { password: passwordHash },
      });
      info("Password hash migration attempted", {
        event: "auth.password.rehash",
        data: { from: "bcrypt", to: PASSWORD_HASH_VERSION, migrated: count === 1 },
      });
    }

    const csrfToken = createCsrfToken();
    const sessionId = randomUUID();
    await prismaClient.$executeRaw`
      WITH expired AS (
        SELECT "id"
        FROM "auth_sessions"
        WHERE "expires_at" <= ${new Date()}
        ORDER BY "expires_at"
        LIMIT 100
      )
      DELETE FROM "auth_sessions"
      WHERE "id" IN (SELECT "id" FROM expired)
    `;
    await prismaClient.authSession.create({
      data: {
        id: sessionId,
        user_id: user.id,
        csrf_hash: hashCsrfToken(csrfToken),
        expires_at: getSessionExpiry(),
      },
    });

    return this.issueSession(user, organizationId, sessionId, csrfToken);
  }

  async refreshSession(
    identity: Pick<
      AuthIdentity,
      "user_id" | "organization_id" | "session_version" | "session_id" | "csrf_hash"
    >,
  ): Promise<IssuedSession> {
    const sessionVersion = identity.session_version;
    if (
      typeof sessionVersion !== "number" ||
      !Number.isSafeInteger(sessionVersion) ||
      sessionVersion < 0 ||
      !identity.session_id ||
      !identity.csrf_hash ||
      !CSRF_HASH_PATTERN.test(identity.csrf_hash) ||
      !identity.organization_id
    ) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const user = await prismaClient.user.findUnique({
      where: { id: identity.user_id },
      include: {
        organization: { select: { id: true, status: true } },
        department: {
          select: {
            organization_id: true,
            organization: { select: { id: true, status: true } },
          },
        },
        permissions: true,
      },
    });

    if (
      !user ||
      user.session_version !== sessionVersion ||
      getActiveOrganizationId(user) !== identity.organization_id
    ) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const csrfToken = createCsrfToken();
    const { count } = await prismaClient.authSession.updateMany({
      where: {
        id: identity.session_id,
        user_id: user.id,
        csrf_hash: identity.csrf_hash,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      data: {
        csrf_hash: hashCsrfToken(csrfToken),
        expires_at: getSessionExpiry(),
      },
    });

    if (count !== 1) {
      const currentSession = await prismaClient.authSession.findFirst({
        where: {
          id: identity.session_id,
          user_id: user.id,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: { csrf_hash: true },
      });
      if (currentSession && currentSession.csrf_hash !== identity.csrf_hash) {
        throw new ServiceError(409, "Sessão substituída por uma renovação mais recente.");
      }
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    return this.issueSession(user, identity.organization_id, identity.session_id, csrfToken);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    if (!userId || !sessionId) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const { count } = await prismaClient.authSession.updateMany({
      where: { id: sessionId, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    if (count !== 1) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }
  }

  async firstCreate(): Promise<FirstCreateResult> {
    const userExists = await prismaClient.user.findFirst();
    if (userExists) {
      throw new ServiceError(409, "Login já cadastrado");
    }

    const org = await prismaClient.organization.findFirst();
    if (!org) {
      throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
    }

    const dep = await prismaClient.department.findFirst({
      where: { organization_id: org.id },
    });
    if (!dep) {
      throw new ServiceError(400, "Execute o seed do banco antes de usar o firstCreate.");
    }

    const { adminPassword } = getUserServiceEnv();
    const passwordHash = await hashPassword(adminPassword);

    try {
      const user = await prismaClient.user.create({
        data: {
          name: "Admin",
          login: "Admin",
          password: passwordHash,
          permission: 2,
          type: "owner",
          status: "active",
          department_id: dep.id,
        },
        select: {
          id: true,
          name: true,
          login: true,
          permission: true,
          department_id: true,
        },
      });

      return { user };
    } catch (err: unknown) {
      const isUniqueViolation =
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado");
      }
      throw err;
    }
  }

  async validateSession(
    identity: Pick<
      AuthIdentity,
      "user_id" | "organization_id" | "session_version" | "session_id" | "csrf_hash"
    >,
    options: { allowLegacyBearer?: boolean } = {},
  ): Promise<void> {
    const hasSessionId = Boolean(identity.session_id);
    const hasCsrfHash = Boolean(identity.csrf_hash);
    const hasBoundSession = hasSessionId && hasCsrfHash;
    if (
      typeof identity.session_version !== "number" ||
      !identity.organization_id ||
      hasSessionId !== hasCsrfHash ||
      (!hasBoundSession && !options.allowLegacyBearer) ||
      (identity.csrf_hash !== undefined && !CSRF_HASH_PATTERN.test(identity.csrf_hash))
    ) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    let user: PersistedAuthContext | null | undefined;
    if (hasBoundSession) {
      const session = await prismaClient.authSession.findFirst({
        where: {
          id: identity.session_id,
          user_id: identity.user_id,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        select: {
          csrf_hash: true,
          user: { select: SESSION_VALIDATION_USER_SELECT },
        },
      });
      if (session && session.csrf_hash !== identity.csrf_hash) {
        throw new ServiceError(409, "Sessão substituída por uma renovação mais recente.");
      }
      user = session?.user;
    } else {
      user = await prismaClient.user.findUnique({
        where: { id: identity.user_id },
        select: SESSION_VALIDATION_USER_SELECT,
      });
    }

    if (
      !user ||
      user.session_version !== identity.session_version ||
      getActiveOrganizationId(user) !== identity.organization_id
    ) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }
  }
}

export { AuthService };
