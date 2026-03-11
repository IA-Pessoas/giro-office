import bcrypt from "bcryptjs";

import { ServiceError } from "@workspace/shared";

import prismaClient from "../prisma/index.js";

const USER_PUBLIC_SELECT = {
  id: true,
  organization_id: true,
  name: true,
  login: true,
  permission: true,
  status: true,
  department_id: true,
  photo_url: true,
  joined_at: true,
} as const;

interface CreateUserInput {
  organization_id: string;
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: number;
  status?: string;
  photo_url?: string;
  invited_by?: string;
}

interface UpdateUserInput {
  name?: string;
  login?: string;
  password?: string;
  department_id?: string;
  permission?: number;
  status?: string;
  photo_url?: string;
}

interface ListUsersParams {
  organizationId: string;
  skip?: number;
  take?: number;
}

class UserService {
  async list({ organizationId, skip = 0, take = 20 }: ListUsersParams) {
    const [users, total] = await Promise.all([
      prismaClient.user.findMany({
        where: { organization_id: organizationId },
        select: USER_PUBLIC_SELECT,
        skip,
        take,
        orderBy: { name: "asc" },
      }),
      prismaClient.user.count({
        where: { organization_id: organizationId },
      }),
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
          organization_id: data.organization_id,
          name: data.name,
          login: data.login,
          password: passwordHash,
          department_id: data.department_id,
          permission: data.permission,
          status: data.status ?? "active",
          photo_url: data.photo_url,
          invited_by: data.invited_by,
        },
        select: USER_PUBLIC_SELECT,
      });

      return user;
    } catch (err: unknown) {
      const isUniqueViolation =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado.");
      }
      throw err;
    }
  }

  async update(id: string, data: UpdateUserInput) {
    await this.getById(id);

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.login !== undefined) updateData.login = data.login;
    if (data.department_id !== undefined) updateData.department_id = data.department_id;
    if (data.permission !== undefined) updateData.permission = data.permission;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.photo_url !== undefined) updateData.photo_url = data.photo_url;

    if (data.password !== undefined) {
      updateData.password = await bcrypt.hash(data.password, 8);
    }

    try {
      const user = await prismaClient.user.update({
        where: { id },
        data: updateData,
        select: USER_PUBLIC_SELECT,
      });

      return user;
    } catch (err: unknown) {
      const isUniqueViolation =
        err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
      if (isUniqueViolation) {
        throw new ServiceError(409, "Login já cadastrado.");
      }
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
      throw new ServiceError(500, "Erro ao desativar usuário.", err);
    }
  }
} 

export { UserService };
