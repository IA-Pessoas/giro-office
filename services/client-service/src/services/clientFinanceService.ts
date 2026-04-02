import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { UpdateFinanceBody } from "../schemas/clientVerticals.schema.js";

export async function updateFinanceClient(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  _userId: string | null,
  input: UpdateFinanceBody,
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true, contract: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { contract: input.contract },
    select: { id: true, contract: true },
  });

  return updated as Record<string, unknown>;
}
