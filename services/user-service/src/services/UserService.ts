import bcrypt from "bcryptjs";

import { error as logError, ServiceError } from "@workspace/shared";

import prismaClient from "../prisma/index.js";
import { PermissionService } from "./PermissionService.js";

const USER_PUBLIC_SELECT = {
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
} as const;

const USER_CREATE_SELECT = {
  ...USER_PUBLIC_SELECT,
  organization_id: true,
  type: true,
  first_owner_flag: true,
  permission_id: true,
} as const;

const OWNER_MAX_MODULE_VALUE = 2;
const MODULE_FIELDS = [
  "atendimento",
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pec",
  "pessoal",
  "regularize",
  "rh",
  "triagem",
  "wiki",
] as const;
const MAX_MODULES = Object.fromEntries(
  MODULE_FIELDS.map((f) => [f, OWNER_MAX_MODULE_VALUE])
) as Record<string, number>;

interface CreateUserInput {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: number;
  status?: string;
  photo_url?: string;
  invited_by?: string;
  organization_id?: string;
  type?: "owner" | "admin" | "user";
  first_owner_flag?: boolean;
  modules?: Record<string, number | null>;
}

interface UpdateUserInput {
  name?: string;
  login?: string;
  password?: string;
  department_id?: string;
  permission?: number;
  status?: string;
  photo_url?: string | null;
  organization_id?: string | null;
  type?: "owner" | "admin" | "user" | null;
  first_owner_flag?: boolean;
  modules?: Record<string, number | null>;
}

interface ListUsersParams {
  skip?: number;
  take?: number;
}

class UserService {
  async list({ skip = 0, take = 20 }: ListUsersParams) {
    const [users, total] = await Promise.all([
      prismaClient.user.findMany({
        select: USER_PUBLIC_SELECT,
        skip,
        take,
        orderBy: { name: "asc" },
      }),
      prismaClient.user.count(),
    ]);

    return { users, total, skip, take };
  }

  async getById(id: string) {
    const user = await prismaClient.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });

    if (!user) {
      throw new ServiceError(404, "Usuário não encontrado.");
    }

    return user;
  }

  async create(data: CreateUserInput) {
    const passwordHash = await bcrypt.hash(data.password, 8);

    try {
      const user = await prismaClient.user.create({
        data: {
          name: data.name,
          login: data.login,
          password: passwordHash,
          department_id: data.department_id,
          permission: data.permission,
          status: data.status ?? "active",
          photo_url: data.photo_url,
          invited_by: data.invited_by,
          organization_id: data.organization_id ?? null,
          type: data.type ?? null,
          first_owner_flag: data.first_owner_flag ?? false,
        },
        select: data.organization_id ? USER_CREATE_SELECT : USER_PUBLIC_SELECT,
      });

      if (data.organization_id) {
        try {
          const permissionService = new PermissionService();
          const permission = await permissionService.create(user.id, data.organization_id);

          if (data.type === "owner") {
            await permissionService.update(user.id, MAX_MODULES);
          } else if (
            (data.type === "admin" || data.type === "user") &&
            data.modules &&
            Object.keys(data.modules).length > 0
          ) {
            await permissionService.update(user.id, data.modules);
          }

          await prismaClient.user.update({
            where: { id: user.id },
            data: { permission_id: permission.id },
          });

          return {
            ...user,
            permission_id: permission.id,
          };
        } catch (permErr: unknown) {
          logError("Erro ao criar/atualizar permissão no create de usuário", { err: permErr });
          throw new ServiceError(500, "Erro ao criar permissão para o usuário.", permErr);
        }
      }

      return user;
    } catch (err: unknown) {
      const isUniqueViolation =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado.");
      }
      logError("Erro ao criar usuário", { err });
      throw err;
    }
  }

  async update(id: string, data: UpdateUserInput) {
    const existingUser = await prismaClient.user.findUnique({
      where: { id },
      select: { ...USER_PUBLIC_SELECT, permission_id: true },
    });

    if (!existingUser) {
      throw new ServiceError(404, "Usuário não encontrado.");
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.login !== undefined) updateData.login = data.login;
    if (data.department_id !== undefined) updateData.department_id = data.department_id;
    if (data.permission !== undefined) updateData.permission = data.permission;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.photo_url !== undefined) updateData.photo_url = data.photo_url;
    if (data.organization_id !== undefined) updateData.organization_id = data.organization_id;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.first_owner_flag !== undefined) updateData.first_owner_flag = data.first_owner_flag;

    if (data.password !== undefined) {
      updateData.password = await bcrypt.hash(data.password, 8);
    }

    try {
      const user = await prismaClient.user.update({
        where: { id },
        data: updateData,
        select: USER_PUBLIC_SELECT,
      });

      if (data.modules && Object.keys(data.modules).length > 0) {
        if (!existingUser.permission_id) {
          logError("Usuário sem permissão: não é possível atualizar modules", { userId: id });
          throw new ServiceError(400, "Usuário não possui permissão. Crie a permissão primeiro.");
        }
        const permissionService = new PermissionService();
        await permissionService.update(id, data.modules);
      }

      if (data.type === "owner" && existingUser.permission_id) {
        const permissionService = new PermissionService();
        await permissionService.update(id, MAX_MODULES);
      }

      return user;
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      const isUniqueViolation =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado.");
      }
      logError("Erro ao atualizar usuário", { err });
      throw err;
    }
  }

  async delete(id: string) {
    await this.getById(id);

    try {
      await prismaClient.user.update({
        where: { id },
        data: { status: "inactive" },
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr?.code === "P2003") {
        throw new ServiceError(409, "Não é possível desativar: usuário possui vínculos.");
      }
      logError("Erro ao desativar usuário", { err });
      throw new ServiceError(500, "Erro ao desativar usuário.", err);
    }
  }
} 

export { UserService };
