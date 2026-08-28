import { ACTIVE_MODULE_KEYS, type ModulePermissions, ServiceError } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";
import type { UserAuditRecorder } from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { PlatformUserManagementAdapter } from "./userManagementService.js";
import { type CreateUserInput, UserManagementService, UserService } from "./userService.js";

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
  private readonly userService = new UserService();

  constructor(private readonly audit?: UserAuditRecorder) {}

  async create(
    organizationId: string,
    input: CreateUserInput,
    _platformUserId: string,
  ): Promise<PlatformUserListRow> {
    const management = new PlatformUserManagementAdapter(new UserManagementService(), {
      actor: { kind: "platform", platformUserId: _platformUserId },
      organizationId,
    });
    const user = await management.create({
      ...input,
      organization_id: organizationId,
    });
    return {
      id: user.id,
      name: user.name,
      login: user.login,
      status: user.status,
      department_id: user.department_id,
      photo_url: user.photo_url,
      type: user.type,
    };
  }

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

  async getPermissions(
    organizationId: string,
    userId: string,
    platformUserId: string,
  ): ReturnType<UserManagementService["getPermissions"]> {
    const management = new PlatformUserManagementAdapter(new UserManagementService(), {
      actor: { kind: "platform", platformUserId },
      organizationId,
    });
    return management.getPermissions(userId);
  }

  async updatePermissions(
    organizationId: string,
    userId: string,
    modules: Partial<ModulePermissions>,
    platformUserId: string,
  ): ReturnType<UserManagementService["updatePermissions"]> {
    const management = new PlatformUserManagementAdapter(new UserManagementService(), {
      actor: { kind: "platform", platformUserId },
      organizationId,
    });
    const before = await management.getPermissions(userId);
    const after = await management.updatePermissions(userId, modules);
    await this.audit?.({
      actorUserId: platformUserId,
      platformActorUserId: platformUserId,
      organizationId,
      action: "platform.user.permissions.updated",
      referring: "user",
      referringId: userId,
      changes: {
        modules: {
          before: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, before[key]])),
          after: Object.fromEntries(ACTIVE_MODULE_KEYS.map((key) => [key, after[key]])),
        },
      },
      outcome: "success",
    });
    return after;
  }

  async deactivate(organizationId: string, userId: string): Promise<PlatformUserListRow> {
    const user = await this.getById(organizationId, userId);
    await this.userService.delete(userId, organizationId);
    return { ...user, status: "inactive" };
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
    };
  }
}
