import { ServiceError } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";
import prismaClient from "../prisma/index.js";

const MAX_PAGE_SIZE = 100;
const PLATFORM_USER_LIST_SELECT = {
  id: true,
  name: true,
  login: true,
  status: true,
  department_id: true,
  photo_url: true,
  type: true,
} as const;

export interface ListPlatformUsersInput {
  organizationId: string;
  skip: number;
  take: number;
  search: string;
}

type PlatformUserListRow = Prisma.UserGetPayload<{ select: typeof PLATFORM_USER_LIST_SELECT }>;

export class PlatformUsersService {
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
}
