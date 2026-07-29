import {
  ACTIVE_MODULE_KEYS,
  type AuthIdentity,
  type AuthUserType,
  ServiceError,
  type ModulePermissionKey,
  type ModulePermissions,
} from "@workspace/shared";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { getUserServiceEnv } from "../config/env.js";
import prismaClient from "../prisma/index.js";

interface LoginRequest {
  login: string;
  password: string;
}

export interface CreateSessionRequest {
  userId: string;
  organizationId: string;
  departmentId: string;
}

type SessionUser = {
  id: string;
  name: string;
  login: string;
  permission: number;
  type: unknown;
  session_version: number;
  permissions: Array<
    {
      organization_id: string;
    } & Partial<Record<ModulePermissionKey, number | null>>
  >;
};

const MODULE_PERMISSION_KEYS: readonly ModulePermissionKey[] = ACTIVE_MODULE_KEYS;

function normalizeAuthUserType(value: unknown): AuthUserType | undefined {
  return value === "owner" || value === "admin" || value === "user" ? value : undefined;
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
  async login({ login, password }: LoginRequest): Promise<LoginResult> {
    const user = await prismaClient.user.findFirst({
      where: { login },
      include: {
        department: { select: { organization_id: true } },
        permissions: true,
      },
    });

    if (!user) {
      throw new ServiceError(401, "Usuario nao existe no sistema");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new ServiceError(401, "Login/Senha Incorreto!");
    }

    const organizationId = user.organization_id ?? user.department.organization_id;
    if (!organizationId) {
      throw new ServiceError(400, "Usuario sem organizacao vinculada.");
    }

    return this.createSessionFromUser(user, organizationId, user.department_id);
  }

  async createSession({
    userId,
    organizationId,
    departmentId,
  }: CreateSessionRequest): Promise<LoginResult> {
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || user.status !== "active") {
      throw new ServiceError(401, "Usuário não está ativo.");
    }

    return this.createSessionFromUser(user, organizationId, departmentId);
  }

  private createSessionFromUser(
    user: SessionUser,
    organizationId: string,
    departmentId: string,
  ): LoginResult {
    const jwtSecret = getUserServiceEnv().jwtSecret;
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
        modules,
      },
      jwtSecret,
      { subject: user.id, expiresIn: "1d" },
    );

    return {
      id: user.id,
      name: user.name,
      login: user.login,
      permission: user.permission,
      type,
      modules,
      department_id: departmentId,
      organization_id: organizationId,
      token,
    };
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
    const passwordHash = await bcrypt.hash(adminPassword, 8);

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
    identity: Pick<AuthIdentity, "user_id" | "session_version">,
  ): Promise<void> {
    if (typeof identity.session_version !== "number") {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }

    const user = await prismaClient.user.findUnique({
      where: { id: identity.user_id },
      select: { session_version: true, status: true },
    });

    if (!user || user.status !== "active" || user.session_version !== identity.session_version) {
      throw new ServiceError(401, "Sessão obsoleta. Faça login novamente.");
    }
  }
}

export { AuthService };
