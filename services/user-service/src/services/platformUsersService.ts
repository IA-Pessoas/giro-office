import { ServiceError } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";
import prismaClient from "../prisma/index.js";
import { UserService } from "./userService.js";

const MAX_PAGE_SIZE = 100;
const PLATFORM_USER_LIST_SELECT = {
  id: true,
  name: true,
  login: true,
  status: true,
  department_id: true,
  permission: true,
  photo_url: true,
  type: true,
  version: true,
} as const;

export interface ListPlatformUsersInput {
  organizationId: string;
  skip: number;
  take: number;
  search: string;
}

type PlatformUserListRow = Prisma.UserGetPayload<{ select: typeof PLATFORM_USER_LIST_SELECT }>;

export class PlatformUsersService {
  private readonly userService = new UserService();

  async list({ organizationId, skip, take, search }: ListPlatformUsersInput): Promise<{
    users: PlatformUserListRow[];
    total: number;
    hasMore: boolean;
  }> {
    const normalizedSearch = search.trim();
    const where: Prisma.UserWhereInput = {
      organization_id: organizationId,
      ...(normalizedSearch
        ? {
            OR: [
              { name: { contains: normalizedSearch, mode: "insensitive" } },
              { login: { contains: normalizedSearch, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const pageSize = Math.min(take, MAX_PAGE_SIZE);
    const [users, total] = await Promise.all([
      prismaClient.user.findMany({
        where,
        select: PLATFORM_USER_LIST_SELECT,
        skip,
        take: pageSize,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prismaClient.user.count({ where }),
    ]);

    return { users, total, hasMore: skip + users.length < total };
  }

  async getById(organizationId: string, userId: string): Promise<PlatformUserListRow> {
    const user = await prismaClient.user.findFirst({
      where: { id: userId, organization_id: organizationId },
      select: PLATFORM_USER_LIST_SELECT,
    });

    if (!user) throw new ServiceError(404, "Usuário não encontrado.");
    return user;
  }

  async listDepartments(organizationId: string): Promise<Array<{ id: string; name: string }>> {
    return prismaClient.department.findMany({
      where: { organization_id: organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async deactivate(organizationId: string, userId: string): Promise<PlatformUserListRow> {
    const user = await this.getById(organizationId, userId);
    await this.userService.delete(userId, organizationId);
    return { ...user, status: "inactive", version: user.version + 1 };
  }

  async reactivate(organizationId: string, userId: string): Promise<PlatformUserListRow> {
    const user = await this.userService.update(
      userId,
      { status: "active" },
      organizationId,
      undefined,
      "REACTIVATE",
    );
    return {
      id: user.id,
      name: user.name,
      login: user.login,
      status: user.status,
      department_id: user.department_id,
      photo_url: user.photo_url,
      type: user.type,
      permission: user.permission,
      version: user.version,
    };
  }

  async update(
    organizationId: string,
    userId: string,
    input: {
      name?: string;
      login?: string;
      password?: string;
      department_id?: string;
      permission?: number;
      status?: "active" | "inactive";
      expected_version: number;
    },
  ): Promise<PlatformUserListRow> {
    const user = await this.userService.update(userId, input, organizationId);
    return {
      id: user.id,
      name: user.name,
      login: user.login,
      status: user.status,
      department_id: user.department_id,
      photo_url: user.photo_url,
      type: user.type,
      permission: user.permission,
      version: user.version,
    };
  }
}
