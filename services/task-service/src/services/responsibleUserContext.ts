import { ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";

type UserLookupClient = {
  user: {
    findMany(args: Prisma.UserFindManyArgs): Promise<Array<{ id: string }>>;
  };
};

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
      "Todos os responsaveis devem ser usuarios ativos do departamento informado.",
    );
  }
}
