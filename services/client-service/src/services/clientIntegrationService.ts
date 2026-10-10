import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoServiceAuthorization,
  normalizeModulePermission,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  AUDITED_TRANSACTION,
  auditUnavailable,
  type ClientEntityAudit,
} from "../integrations/audit.js";
import type {
  CreateIntegrationBody,
  UpdateIntegrationBody,
} from "../schemas/clientVerticals.schemas.js";
import {
  assertValidClientDocument,
  isClientDocumentUniqueConstraintError,
} from "../utils/clientDocuments.js";
import { cleanDocument } from "../utils/documents.js";
import { MARKETING_CLIENT_PROFILE_ACCESS } from "../utils/moduleAuthorization.js";

type ClientAuthorization = IntegracaoServiceAuthorization & {
  marketingLevel?: number;
  userId: string;
};

export async function createIntegrationClient(
  prisma: PrismaClient,
  input: CreateIntegrationBody & { organization_id: string },
  authorization: ClientAuthorization = {
    userId: "",
    level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
    isOwner: false,
  },
): Promise<{ id: string; name: string; cpf_cnpj: string; regime: string | null }> {
  requireIntegracaoRouteAccess("POST", "/client/integration", {
    userId: authorization.userId,
    level: authorization.level,
    organizationId: input.organization_id,
    resourceOrganizationId: input.organization_id,
    isOwner: authorization.isOwner,
    requestedFields: Object.keys(input).filter((field) => field !== "organization_id"),
  });

  const cleanedCpf = assertValidClientDocument(input.cpf_cnpj, input.type);
  const exists = await prisma.client.findFirst({
    where: { cpf_cnpj: cleanedCpf, organization_id: input.organization_id },
    select: { id: true },
  });
  if (exists) {
    throw new ServiceError(409, "Cliente já cadastrado.");
  }

  const cleanedCpfResponsible = cleanDocument(input.cpf_responsible);
  const cleanedCpfAgent = cleanDocument(input.cpf_agent);

  try {
    const client = await prisma.client.create({
      data: {
        organization_id: input.organization_id,
        type: input.type,
        name: input.name,
        company_name: input.company_name ?? null,
        fantasy_name: input.fantasy_name ?? null,
        cpf_cnpj: cleanedCpf,
        regime: input.regime ?? null,
        opening_date: input.opening_date ?? null,
        responsible: input.responsible ?? null,
        cpf_responsible: cleanedCpfResponsible,
        number: input.number ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        cep: input.cep ?? null,
        neighborhood: input.neighborhood ?? null,
        state: input.state ?? null,
        city: input.city ?? null,
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
        regime: true,
      },
    });

    return client;
  } catch (error) {
    if (isClientDocumentUniqueConstraintError(error)) {
      throw new ServiceError(409, "Cliente já cadastrado.", error);
    }
    throw error;
  }
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
  audit?: ClientEntityAudit,
): Promise<Record<string, unknown>> {
  const requestedFields = Object.keys(input);
  const isMarketingInstagramUpdate =
    requestedFields.length === 1 && requestedFields[0] === "instagram";
  const hasMarketingInstagramEditAccess =
    isMarketingInstagramUpdate &&
    normalizeModulePermission(authorization.marketingLevel) >=
      MARKETING_CLIENT_PROFILE_ACCESS.EDITOR;

  if (!hasMarketingInstagramEditAccess) {
    requireIntegracaoRouteAccess("PATCH", "/client/:id/integration", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId,
      resourceOrganizationId: organizationId,
      isOwner: authorization.isOwner,
      requestedFields,
    });
  }

  const exists = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true, type: true, cpf_cnpj: true, instagram: true },
  });
  if (!exists) {
    throw new ServiceError(404, "Cliente não encontrado.");
  }

  const documentType = input.type ?? exists.type;
  const cleanedCpfCnpj =
    input.cpf_cnpj !== undefined
      ? assertValidClientDocument(input.cpf_cnpj, documentType)
      : input.type !== undefined
        ? assertValidClientDocument(exists.cpf_cnpj, documentType)
        : undefined;
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

  if (input.regime !== undefined) {
    data.regime = input.regime;
  }

  if (cleanedCpfCnpj !== undefined) {
    const duplicate = await prisma.client.findFirst({
      where: {
        organization_id: organizationId,
        cpf_cnpj: cleanedCpfCnpj,
        id: { not: clientId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ServiceError(409, "Cliente já cadastrado.");
    }
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
    regime: true,
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
  const marketingProfileSelect = {
    id: true,
    name: true,
    status: true,
    instagram: true,
  } as const;

  // O perfil Instagram (editável pelo Marketing) tem trilha exigida: sem ela, nada é salvo.
  const instagramChanged =
    data.instagram !== undefined && (exists.instagram ?? null) !== (data.instagram ?? null);
  if (instagramChanged && !audit) throw auditUnavailable();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.client.update({
        where: { id: clientId },
        data,
        select: hasMarketingInstagramEditAccess ? marketingProfileSelect : select,
      });
      if (instagramChanged && audit) {
        await audit({
          organizationId,
          userId: authorization.userId,
          action: "update",
          referring: "clients",
          referringId: clientId,
          changes: { instagram: { from: exists.instagram ?? null, to: data.instagram ?? null } },
        });
      }
      return row;
    }, AUDITED_TRANSACTION);

    return updated as Record<string, unknown>;
  } catch (error) {
    if (isClientDocumentUniqueConstraintError(error)) {
      throw new ServiceError(409, "Cliente já cadastrado.", error);
    }
    throw error;
  }
}
