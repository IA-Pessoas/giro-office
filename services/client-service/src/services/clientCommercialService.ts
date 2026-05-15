import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { UpdateCommercialBody } from "../schemas/clientVerticals.schemas.js";

const OPEN_TASK_STATUSES = ["A Realizar", "Em andamento", "Em Espera", "Pendente"] as const;

/**
 * Fluxo comercial alinhado ao legado `updateComercial` (atualização de cliente + tarefas).
 * Envio de e-mail ao fechar prospecção não está replicado aqui (dependia de `EmailService` no monólito).
 */
export async function updateCommercialClient(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  _userId: string | null,
  input: UpdateCommercialBody,
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: {
      id: true,
      name: true,
      company_name: true,
      fantasy_name: true,
      cpf_cnpj: true,
      responsible: true,
      cpf_responsible: true,
      agent: true,
      cpf_agent: true,
      number: true,
      email: true,
      address: true,
      cep: true,
      neighborhood: true,
      state: true,
      city: true,
      instagram: true,
      indication: true,
      participants_meet: true,
      meet_type: true,
      service_unique: true,
      status: true,
      prospecting_status: true,
      type_registration: true,
    },
  });

  if (!exists) {
    throw new ServiceError(404, "Cliente nÃƒÂ£o encontrado.");
  }

  const { prospecting_status } = input;

  let status = exists.status;
  if (prospecting_status === "Fechado") {
    status = "Ativo";
  } else if (
    prospecting_status === "Recusado pelo Cliente" ||
    prospecting_status === "Paralisado"
  ) {
    status = prospecting_status;
  }

  if (
    status === "Recusado pelo Cliente" &&
    prospecting_status !== "Recusado pelo Cliente" &&
    prospecting_status !== "Paralisado" &&
    prospecting_status !== "Fechado"
  ) {
    status = "ProspecÃƒÂ§ÃƒÂ£o";
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      status,
      prospecting_status,
      ...(input.date_status !== undefined ? { date_status: input.date_status } : {}),
      ...(input.description_prospecting !== undefined
        ? { description_prospecting: input.description_prospecting }
        : {}),
      ...(input.register_date_prospecting !== undefined
        ? { register_date_prospecting: input.register_date_prospecting }
        : {}),
    },
    select: {
      id: true,
      name: true,
      company_name: true,
      fantasy_name: true,
      cpf_cnpj: true,
      prospecting_status: true,
      date_status: true,
      description_prospecting: true,
      register_date_prospecting: true,
    },
  });

  if (prospecting_status === "Recusado pelo Cliente" || prospecting_status === "Paralisado") {
    await prisma.task.updateMany({
      where: {
        status: { in: [...OPEN_TASK_STATUSES] },
        client_id: clientId,
        organization_id: organizationId,
      },
      data: {
        status: prospecting_status === "Recusado pelo Cliente" ? "NÃƒÂ£o Contratado" : "Paralisado",
      },
    });
  } else if (prospecting_status === "Fechado") {
    const reopenTaskStatuses = ["A Realizar", "Em andamento"];
    const baseWhere = {
      status: { in: reopenTaskStatuses },
      charge_comercial: false,
      client_id: clientId,
      organization_id: organizationId,
    };

    await prisma.task.updateMany({
      where: {
        ...baseWhere,
        billing: "Realizar",
      },
      data: {
        status: "A Realizar",
      },
    });

    await prisma.task.updateMany({
      where: {
        ...baseWhere,
        billing: { not: "Realizar" },
      },
      data: {
        status: "Em andamento",
      },
    });
  }

  return updated as Record<string, unknown>;
}
