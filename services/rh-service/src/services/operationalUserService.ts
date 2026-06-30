import { assertNonEmptyString, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma } from "../generated/prisma/client.js";
import { prismaClient } from "../integrations/prisma.js";

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

class OperationalUserService {
  async list(organizationId: string): Promise<OperationalUserSnapshot[]> {
    try {
      const orgId = assertNonEmptyString(organizationId, "organization_id");
      const users = await prismaClient.user.findMany({
        where: {
          status: "active",
          OR: [
            { organization_id: orgId },
            { organization_id: null, department: { organization_id: orgId } },
          ],
        },
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
