import { ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";

type UserLookupClient = {
  user: {
    findMany(args: Prisma.UserFindManyArgs): Promise<Array<{ id: string }>>;
  };
};

const RH_LEADERSHIP_PERMISSION = 3;

export function taskResponsibleEligibilityWhere(
  organizationId: string,
  departmentId?: string,
): Prisma.UserWhereInput {
  return {
    status: "active",
    ...(departmentId ? { department: { id: departmentId, organization_id: organizationId } } : {}),
    AND: [
      { OR: [{ organization_id: organizationId }, { organization_id: null }] },
      {
        OR: [
          { type: "admin" },
          {
            permissions: {
              some: { organization_id: organizationId, rh: { gte: RH_LEADERSHIP_PERMISSION } },
            },
          },
        ],
      },
    ],
  };
}

export async function listEligibleTaskResponsibles(
  client: UserLookupClient,
  organizationId: string,
  departmentId: string,
): Promise<Array<{ id: string }>> {
  return client.user.findMany({
    where: taskResponsibleEligibilityWhere(organizationId, departmentId),
    select: { id: true },
    orderBy: { name: "asc" },
  });
}

export async function assertResponsibleUsersInDepartment(
  client: UserLookupClient,
  organizationId: string,
  departmentId: string,
  userIds: Array<string | null | undefined>,
): Promise<void> {
  const responsibleIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];

  if (responsibleIds.length === 0) {
    return;
  }

  const users = await client.user.findMany({
    where: {
      id: { in: responsibleIds },
      status: "active",
      department: {
        id: departmentId,
        organization_id: organizationId,
      },
      OR: [{ organization_id: organizationId }, { organization_id: null }],
    },
    select: { id: true },
  });

  if (users.length !== responsibleIds.length) {
    throw new ServiceError(
      422,
      "Todos os responsáveis devem ser usuários ativos do departamento informado.",
    );
  }
}
