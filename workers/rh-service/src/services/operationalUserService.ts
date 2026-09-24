import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";
import type { ModulePermissionKey } from "@workspace/shared/auth";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const OPERATIONAL_USER_SELECT = {
  id: true,
  name: true,
  status: true,
  department: { select: { name: true } },
} as const;

type OperationalUserRow = Prisma.UserGetPayload<{
  select: typeof OPERATIONAL_USER_SELECT;
}>;

export interface OperationalUserSnapshot {
  id: string;
  name: string;
  department: string;
  status: string;
}

export interface OperationalUserContext {
  departmentId?: string;
  departmentName?: string;
  module?: ModulePermissionKey;
}

class OperationalUserService {
  constructor(private readonly prismaClient: PrismaClient) {}

  async list(
    organizationId: string,
    context: OperationalUserContext = {},
  ): Promise<OperationalUserSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const where: Prisma.UserWhereInput = {
        status: "active",
        OR: [
          { organization_id: orgId },
          { organization_id: null, department: { organization_id: orgId } },
        ],
      };

      if (context.departmentId || context.departmentName) {
        where.department = {
          organization_id: orgId,
          ...(context.departmentId ? { id: context.departmentId } : {}),
          ...(context.departmentName ? { name: context.departmentName } : {}),
        };
      }

      if (context.module) {
        where.permissions = {
          some: {
            organization_id: orgId,
            [context.module]: { gt: 0 },
          },
        };
      }

      const users = await this.prismaClient.user.findMany({
        where,
        orderBy: { name: "asc" },
        select: OPERATIONAL_USER_SELECT,
      });

      return users.map((user: OperationalUserRow) => ({
        id: user.id,
        name: user.name,
        department: user.department.name,
        status: user.status,
      }));
    } catch (err: unknown) {
      logError("Erro ao listar colaboradores operacionais RH", { err });
      if (err instanceof ServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceError(500, `Erro interno ao listar colaboradores. ${msg}`, err);
    }
  }
}

export { OperationalUserService };
