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

interface PersistedAuthContext {
  status: string;
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
  session_version: number;
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

function getActiveOrganizationId(user: PersistedAuthContext): string | undefined {
  const organizationId = user.organization_id ?? user.department.organization_id;
  const organization = user.organization_id ? user.organization : user.department.organization;

  if (
    user.status !== "active" ||
    user.department.organization_id !== organizationId ||
    !organization ||
    organization.id !== organizationId ||
    organization.status !== "active"
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
  if (organization.status !== "active") {
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
  private issueSession(user: SessionSource, organizationId: string): IssuedSession {
    const permissionRecord = user.permissions.find(
      (permission) => permission.organization_id === organizationId,
    );
    const modules = MODULE_PERMISSION_KEYS.reduce<ModulePermissions>((acc, key) => {
      acc[key] = permissionRecord?.[key] ?? 0;
      return acc;
    }, {} as ModulePermissions);
    const type = normalizeAuthUserType(user.type);
    const csrfToken = createCsrfToken();
    const token = jwt.sign(
      {
        user_id: user.id,
        organization_id: organizationId,
        name: user.name,
        login: user.login,
        permission: user.permission,
        type,
        session_version: user.session_version,
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
    const user = await prismaClient.user.findFirst({
      where: { login: normalizedLogin },
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

    return this.issueSession(user, organizationId);
  }

  async refreshSession(
    identity: Pick<AuthIdentity, "user_id" | "organization_id" | "session_version">,
  ): Promise<IssuedSession> {
    if (typeof identity.session_version !== "number" || !identity.organization_id) {
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
      user.session_version !== identity.session_version ||
      getActiveOrganizationId(user) !== identity.organization_id
    ) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    return this.issueSession(user, identity.organization_id);
  }

  async revokeSession(userId: string, sessionVersion: number): Promise<void> {
    if (!userId || !Number.isInteger(sessionVersion) || sessionVersion < 0) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const { count } = await prismaClient.user.updateMany({
      where: { id: userId, session_version: sessionVersion },
      data: { session_version: { increment: 1 } },
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
    identity: Pick<AuthIdentity, "user_id" | "organization_id" | "session_version">,
  ): Promise<void> {
    if (typeof identity.session_version !== "number" || !identity.organization_id) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const user = await prismaClient.user.findUnique({
      where: { id: identity.user_id },
      select: {
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
      },
    });

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
