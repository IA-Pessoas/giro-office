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

  const list = await prisma.task.findMany({
    where: {
      status: { in: [...OPEN_TASK_STATUSES] },
      client_id: clientId,
      organization_id: organizationId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      department_id: true,
      observations: true,
      billing: true,
      urgency: true,
      responsible_id: true,
      responsible2_id: true,
      responsible3_id: true,
      prevision_date: true,
    },
  });

  for (const task of list) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "Paralisado",
        department_id: task.department_id,
        observations: task.observations ?? "",
        billing: task.billing,
        urgency: task.urgency,
        responsible_id: task.responsible_id,
        responsible2_id: task.responsible2_id,
        responsible3_id: task.responsible3_id,
        prevision_date: task.prevision_date,
      },
    });
  }

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
