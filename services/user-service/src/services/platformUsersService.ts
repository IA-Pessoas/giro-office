import { ACTIVE_MODULE_KEYS, type ModulePermissions, ServiceError } from "@workspace/shared";
import { Prisma } from "../generated/prisma/client.js";
import type { UserAuditRecorder } from "../integrations/audit.js";
import prismaClient from "../prisma/index.js";
import { PlatformUserManagementAdapter } from "./userManagementService.js";
import { type CreateUserInput, UserManagementService, UserService } from "./userService.js";

const MAX_PAGE_SIZE = 100;
const OWNER_PERMISSION = 2;
const DEMOTED_OWNER_PERMISSION = 1;
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

export interface TransferPlatformOwnershipInput {
  currentOwnerId: string;
  successorUserId: string;
  previousOwnerAction: "demote" | "deactivate";
  justification: string;
}

type PlatformUserListRow = Prisma.UserGetPayload<{ select: typeof PLATFORM_USER_LIST_SELECT }>;

const PLATFORM_SUPER_ADMIN_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  can_impersonate: true,
} as const;

type PlatformSuperAdminListRow = Prisma.PlatformUserGetPayload<{
  select: typeof PLATFORM_SUPER_ADMIN_LIST_SELECT;
}>;

const PLATFORM_OWNERSHIP_SELECT = {
  ...PLATFORM_USER_LIST_SELECT,
  permission: true,
  session_version: true,
  version: true,
} as const;

type PlatformOwnershipUser = Prisma.UserGetPayload<{ select: typeof PLATFORM_OWNERSHIP_SELECT }>;

function toPlatformUser(user: PlatformOwnershipUser): PlatformUserListRow {
  const { session_version: _sessionVersion, ...platformUser } = user;
  return platformUser;
}

export class PlatformUsersService {
  private readonly userService = new UserService();

  constructor(private readonly audit?: UserAuditRecorder) {}

  async listSuperAdmins(): Promise<PlatformSuperAdminListRow[]> {
    return prismaClient.platformUser.findMany({
      where: { platform_role: "super_admin" },
      select: PLATFORM_SUPER_ADMIN_LIST_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

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
      permission: user.permission,
      photo_url: user.photo_url,
      type: user.type,
      version: user.version,
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

  async transferOwnership(
    organizationId: string,
    input: TransferPlatformOwnershipInput,
  ): Promise<{ currentOwner: PlatformUserListRow; successor: PlatformUserListRow }> {
    if (input.currentOwnerId === input.successorUserId) {
      throw new ServiceError(400, "O sucessor deve ser diferente do owner atual.");
    }

    return prismaClient.$transaction(
      async (transaction) => {
        const currentOwner = await transaction.user.findFirst({
          where: { id: input.currentOwnerId, organization_id: organizationId },
          select: PLATFORM_OWNERSHIP_SELECT,
        });
        if (!currentOwner) {
          throw new ServiceError(404, "Owner atual não encontrado na organização.");
        }
        if (currentOwner.type !== "owner" || currentOwner.status !== "active") {
          throw new ServiceError(409, "O usuário selecionado não é um owner ativo.");
        }

        const successor = await transaction.user.findFirst({
          where: { id: input.successorUserId, organization_id: organizationId },
          select: PLATFORM_OWNERSHIP_SELECT,
        });
        if (!successor) {
          throw new ServiceError(404, "Sucessor não encontrado na organização.");
        }
        if (successor.status !== "active") {
          throw new ServiceError(409, "O sucessor precisa estar ativo.");
        }

        const promoted = await transaction.user.updateMany({
          where: {
            id: successor.id,
            organization_id: organizationId,
            version: successor.version,
          },
          data: {
            type: "owner",
            permission: OWNER_PERMISSION,
            session_version: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (promoted.count !== 1) {
          throw new ServiceError(409, "O sucessor foi alterado por outra edição. Tente novamente.");
        }

        const currentOwnerStatus =
          input.previousOwnerAction === "deactivate" ? "inactive" : "active";
        const demoted = await transaction.user.updateMany({
          where: {
            id: currentOwner.id,
            organization_id: organizationId,
            version: currentOwner.version,
          },
          data: {
            type: "admin",
            permission: DEMOTED_OWNER_PERMISSION,
            status: currentOwnerStatus,
            session_version: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (demoted.count !== 1) {
          throw new ServiceError(
            409,
            "O owner atual foi alterado por outra edição. Tente novamente.",
          );
        }

        const activeOwners = await transaction.user.count({
          where: { organization_id: organizationId, type: "owner", status: "active" },
        });
        if (activeOwners < 1) {
          throw new ServiceError(409, "A organização deve manter ao menos um owner ativo.");
        }

        return {
          currentOwner: toPlatformUser({
            ...currentOwner,
            type: "admin",
            permission: DEMOTED_OWNER_PERMISSION,
            status: currentOwnerStatus,
            session_version: currentOwner.session_version + 1,
            version: currentOwner.version + 1,
          }),
          successor: toPlatformUser({
            ...successor,
            type: "owner",
            permission: OWNER_PERMISSION,
            session_version: successor.session_version + 1,
            version: successor.version + 1,
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
