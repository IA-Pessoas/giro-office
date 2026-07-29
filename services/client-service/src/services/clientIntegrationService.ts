import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoServiceAuthorization,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateIntegrationBody,
  UpdateIntegrationBody,
} from "../schemas/clientVerticals.schemas.js";
import { cleanDocument } from "../utils/documents.js";

type ClientAuthorization = IntegracaoServiceAuthorization & { userId: string };

export async function createIntegrationClient(
  prisma: PrismaClient,
  input: CreateIntegrationBody & { organization_id: string },
  authorization: ClientAuthorization = {
    userId: "",
    level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
    isOwner: false,
  },
): Promise<{ id: string; name: string; cpf_cnpj: string }> {
  requireIntegracaoRouteAccess("POST", "/client/integration", {
    userId: authorization.userId,
    level: authorization.level,
    organizationId: input.organization_id,
    resourceOrganizationId: input.organization_id,
    isOwner: authorization.isOwner,
    requestedFields: Object.keys(input).filter((field) => field !== "organization_id"),
  });

  const cleanedCpf = cleanDocument(input.cpf_cnpj);
  const exists = await prisma.client.findFirst({
    where: { cpf_cnpj: cleanedCpf, organization_id: input.organization_id },
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
  authorization: ClientAuthorization = {
    userId: "",
    level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
    isOwner: false,
  },
): Promise<Record<string, unknown>> {
  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  requireIntegracaoRouteAccess("PATCH", "/client/:id/integration", {
    userId: authorization.userId,
    level: authorization.level,
    organizationId,
    resourceOrganizationId: organizationId,
    isOwner: authorization.isOwner,
    requestedFields: Object.keys(input),
  });

  const cleanedCpfCnpj = input.cpf_cnpj !== undefined ? cleanDocument(input.cpf_cnpj) : undefined;
  const cleanedCpfResponsible =
    input.cpf_responsible !== undefined ? cleanDocument(input.cpf_responsible) : undefined;
  const cleanedCpfAgent =
    input.cpf_agent !== undefined ? cleanDocument(input.cpf_agent) : undefined;

  const data: Record<string, unknown> = {};

  if (input.type !== undefined) {
    data.type = input.type;
  }

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.company_name !== undefined) {
    data.company_name = input.company_name;
  }

  if (input.fantasy_name !== undefined) {
    data.fantasy_name = input.fantasy_name;
  }

  if (cleanedCpfCnpj !== undefined) {
    data.cpf_cnpj = cleanedCpfCnpj;
  }

  if (input.responsible !== undefined) {
    data.responsible = input.responsible;
  }

  if (cleanedCpfResponsible !== undefined) {
    data.cpf_responsible = cleanedCpfResponsible;
  }

  if (input.agent !== undefined) {
    data.agent = input.agent;
  }

  if (cleanedCpfAgent !== undefined) {
    data.cpf_agent = cleanedCpfAgent;
  }

  if (input.number !== undefined) {
    data.number = input.number;
  }

  if (input.email !== undefined) {
    data.email = input.email;
  }

  if (input.address !== undefined) {
    data.address = input.address;
  }

  if (input.cep !== undefined) {
    data.cep = input.cep;
  }

  if (input.neighborhood !== undefined) {
    data.neighborhood = input.neighborhood;
  }

  if (input.state !== undefined) {
    data.state = input.state;
  }

  if (input.city !== undefined) {
    data.city = input.city;
  }

  if (input.instagram !== undefined) {
    data.instagram = input.instagram;
  }

  if (input.indication !== undefined) {
    data.indication = input.indication;
  }

  if (input.type_registration !== undefined) {
    data.type_registration = input.type_registration;
  }

  if (input.service_unique !== undefined) {
    data.service_unique = input.service_unique;
  }

  if (Object.keys(data).length === 0) {
    throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
  }

  const select = {
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
  };

  const updated = await prisma.client.update({
    where: { id: clientId },
    data,
    select,
  });

  return updated as Record<string, unknown>;
}
