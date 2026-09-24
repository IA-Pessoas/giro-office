import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";

// Competência arquivada é somente leitura até ser restaurada (criar de novo a restaura).
export async function assertCompetenceWritable(
  transaction: Pick<PrismaClient, "triageCompetence">,
  organizationId: string,
  clientId: string,
  competence: string,
): Promise<void> {
  const record = await transaction.triageCompetence.findFirst({
    where: { organization_id: organizationId, client_id: clientId, competence },
    select: { archived_at: true },
  });
  if (record?.archived_at) {
    throw new ServiceError(409, "Competência arquivada. Restaure a competência para editar.");
  }
}
