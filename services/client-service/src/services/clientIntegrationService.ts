import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateIntegrationBody,
  UpdateIntegrationBody,
} from "../schemas/clientVerticals.schema.js";
import { cleanDocument } from "../utils/documents.js";

export async function createIntegrationClient(
  prisma: PrismaClient,
  input: CreateIntegrationBody,
): Promise<{ id: string; name: string; cpf_cnpj: string }> {
  const cleanedCpf = cleanDocument(input.cpf_cnpj);
  const exists = await prisma.client.findFirst({
    where: { cpf_cnpj: cleanedCpf },
    select: { id: true },
  });
  if (exists) {
    throw new ServiceError(409, "Cliente já cadastrado.");
  }

  const cleanedCpfResponsible = cleanDocument(input.cpf_responsible);
  const cleanedCpfAgent = cleanDocument(input.cpf_agent);

  const client = await prisma.client.create({
    data: {
      organization_id: input.organization_id,
      type: input.type,
      name: input.name,
      company_name: input.company_name ?? null,
      fantasy_name: input.fantasy_name ?? null,
      cpf_cnpj: cleanedCpf,
      opening_date: input.opening_date ?? null,
      responsible: input.responsible ?? null,
      cpf_responsible: cleanedCpfResponsible,
      number: input.number ?? null,
      email: input.email ?? null,
      agent: input.agent ?? null,
      cpf_agent: cleanedCpfAgent,
      instagram: input.instagram ?? null,
      indication: input.indication ?? null,
      participants_meet: input.participants_meet ?? null,
      meet_type: input.meet_type ?? null,
      type_registration: input.type_registration,
      service_unique: input.service_unique ?? false,
      status: input.type_registration === "Novo" ? "Prospecção" : "Ativo",
      prospecting_status: input.type_registration === "Novo" ? "Análise/Agendamento" : "Fechado",
    },
    select: {
      id: true,
      name: true,
      cpf_cnpj: true,
    },
  });

  return client;
}

export async function updateIntegrationClient(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  input: UpdateIntegrationBody,
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const cleanedCpfCnpj = input.cpf_cnpj !== undefined ? cleanDocument(input.cpf_cnpj) : undefined;
  const cleanedCpfResponsible =
    input.cpf_responsible !== undefined ? cleanDocument(input.cpf_responsible) : undefined;
  const cleanedCpfAgent =
    input.cpf_agent !== undefined ? cleanDocument(input.cpf_agent) : undefined;

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.company_name !== undefined ? { company_name: input.company_name } : {}),
      ...(input.fantasy_name !== undefined ? { fantasy_name: input.fantasy_name } : {}),
      ...(cleanedCpfCnpj !== undefined ? { cpf_cnpj: cleanedCpfCnpj } : {}),
      ...(input.responsible !== undefined ? { responsible: input.responsible } : {}),
      ...(cleanedCpfResponsible !== undefined ? { cpf_responsible: cleanedCpfResponsible } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(cleanedCpfAgent !== undefined ? { cpf_agent: cleanedCpfAgent } : {}),
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.cep !== undefined ? { cep: input.cep } : {}),
      ...(input.neighborhood !== undefined ? { neighborhood: input.neighborhood } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.instagram !== undefined ? { instagram: input.instagram } : {}),
      ...(input.indication !== undefined ? { indication: input.indication } : {}),
      ...(input.type_registration !== undefined
        ? { type_registration: input.type_registration }
        : {}),
      ...(input.service_unique !== undefined ? { service_unique: input.service_unique } : {}),
    },
    select: {
      id: true,
      type: true,
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
      type_registration: true,
      service_unique: true,
    },
  });

  return updated as Record<string, unknown>;
}
