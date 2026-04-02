import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TerminationBody } from "../schemas/clientVerticals.schema.js";

const OPEN_TASK_STATUSES = ["A Realizar", "Em andamento", "Em Espera", "Pendente"] as const;

export async function terminateClient(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  userId: string,
  input: TerminationBody,
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true, status: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  await prisma.task.updateMany({
    where: {
      status: { in: [...OPEN_TASK_STATUSES] },
      client_id: clientId,
      organization_id: organizationId,
    },
    data: {
      status: "Paralisado",
    },
  });

  const competenceStr = `${input.competence_output}-01T00:00:00Z`;
  const competenceDate = new Date(competenceStr);

  await prisma.client.update({
    where: { id: clientId },
    data: {
      status: "Processo de Inativação",
      competence_output: competenceDate,
    },
    select: { id: true },
  });

  const created = await prisma.clientTermination.create({
    data: {
      client_id: clientId,
      reason: input.reason,
      description: input.description,
      competence: competenceStr,
      user_id: userId,
      organization_id: organizationId,
    },
    select: {
      id: true,
      client_id: true,
      reason: true,
      description: true,
      competence: true,
      user_id: true,
    },
  });

  return created as Record<string, unknown>;
}
