import {
  ACTIVE_MODULE_KEYS,
  type AuthIdentity,
  type AuthUserType,
  info,
  type ModulePermissionKey,
  type ModulePermissions,
  ServiceError,
  withTenantTransaction,
} from "@workspace/shared";
import jwt from "jsonwebtoken";

import { getUserServiceEnv } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import prismaClient from "../prisma/index.js";

interface LoginRequest {
  login: string;
  password: string;
}

const MODULE_PERMISSION_KEYS: readonly ModulePermissionKey[] = ACTIVE_MODULE_KEYS;
const GENERIC_LOGIN_ERROR_MESSAGE = "Login ou senha inválidos.";

interface PersistedAuthContext {
  status: string;
  organization_id: string;
  organization: { id: string; status: string };
  department: {
    organization_id: string;
    organization: { id: string; status: string };
  };
}

type AuthTransaction = Prisma.TransactionClient;

interface LoginSessionRow {
  id: string;
  name: string;
  login: string;
  permission: number;
  type: string | null;
  session_version: number;
  department_id: string;
  organization_id: string;
  modules: Partial<ModulePermissions>;
}

function normalizeAuthUserType(value: unknown): AuthUserType | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
}

function getActiveOrganizationId(user: PersistedAuthContext): string | undefined {
  const organizationId = user.organization_id;
  const organization = user.organization;

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

function rejectLogin(): never {
  info("Authentication rejected", {
    event: "auth.login.rejected",
    data: { reason: "invalid_credentials" },
  });
  throw new ServiceError(401, GENERIC_LOGIN_ERROR_MESSAGE);
}

export interface LoginResult {
  id: string;
  name: string;
  login: string;
  permission: number;
  type?: AuthUserType;
  modules: ModulePermissions;
  department_id: string;
  organization_id: string;
  token: string;
}

class AuthService {
  async login({ login, password }: LoginRequest): Promise<LoginResult> {
    const normalizedLogin = login.trim();
    const [user] = await prismaClient.$queryRaw<LoginSessionRow[]>`
      SELECT * FROM app_private.login_session(${normalizedLogin}, ${password})
    `;
    if (!user) rejectLogin();

    const jwtSecret = getUserServiceEnv().jwtSecret;
    const modules = MODULE_PERMISSION_KEYS.reduce<ModulePermissions>((acc, key) => {
      acc[key] = user.modules[key] ?? 0;
      return acc;
    }, {} as ModulePermissions);
    const type = normalizeAuthUserType(user.type);

    const token = jwt.sign(
      {
        user_id: user.id,
        organization_id: user.organization_id,
        name: user.name,
        login: user.login,
        permission: user.permission,
        type,
        session_version: user.session_version,
        modules,
      },
      jwtSecret,
      {
        subject: user.id,
        expiresIn: "1d",
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
      organization_id: user.organization_id,
      token,
    };
  }

  async validateSession(
    identity: Pick<AuthIdentity, "user_id" | "organization_id" | "session_version">,
  ): Promise<void> {
    if (typeof identity.session_version !== "number" || !identity.organization_id) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const user = await withTenantTransaction<
      AuthTransaction,
      (PersistedAuthContext & { session_version: number }) | null
    >(prismaClient, identity.organization_id, async (prisma: AuthTransaction) => {
      return await prisma.user.findUnique({
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
