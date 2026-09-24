import { ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { TerminationBody } from "../schemas/clientVerticals.schemas.js";

const OPEN_TASK_STATUSES = ["A Realizar", "Em andamento", "Em Espera", "Pendente"] as const;
const TERMINATED_STATUSES = new Set(["Inativo", "Processo de Inativação"]);

function parseCompetenceEndOfMonth(competence: string): Date {
  const [yearRaw, monthRaw] = competence.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ServiceError(400, "competence_output deve estar no formato YYYY-MM.");
  }

  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

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
    throw new ServiceError(404, "Cliente nao encontrado.");
  }
  if (TERMINATED_STATUSES.has(exists.status ?? "")) {
    throw new ServiceError(409, "Cliente já está inativo ou em processo de inativação.");
  }

  const competenceDate = parseCompetenceEndOfMonth(input.competence_output);

  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.task.updateMany({
      where: {
        status: { in: [...OPEN_TASK_STATUSES] },
        client_id: clientId,
        organization_id: organizationId,
      },
      data: {
        status: "Paralisado",
      },
    });

    await tx.client.update({
      where: { id: clientId },
      data: {
        status: "Processo de Inativação",
        competence_output: competenceDate,
      },
      select: { id: true },
    });

    return tx.clientTermination.create({
      data: {
        client_id: clientId,
        reason: input.reason,
        description: input.description,
        competence: input.competence_output,
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
  });

  return created as Record<string, unknown>;
}
