import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

export async function ensurePessoalResponsible(
  prisma: PrismaClient,
  organizationId: string,
  responsibleId: string | null | undefined,
  currentResponsibleId?: string | null,
): Promise<void> {
  if (responsibleId === undefined || responsibleId === null) {
    return;
  }

  if (responsibleId === currentResponsibleId) {
    return;
  }

  const responsible = await prisma.user.findFirst({
    where: {
      id: responsibleId,
      status: "active",
      OR: [
        { organization_id: organizationId },
        { organization_id: null, department: { organization_id: organizationId } },
      ],
      permissions: {
        some: {
          organization_id: organizationId,
          pessoal: { gt: 0 },
        },
      },
    },
    select: { id: true },
  });

  if (!responsible) {
    throw new ServiceError(404, "Responsável não encontrado ou inelegível para Pessoal.");
  }
}
