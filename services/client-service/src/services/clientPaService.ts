import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";

export type CreateClientPAInput = {
  client_id: string;
};

export type UpdateClientPAInput = {
  activities?: string | null;
  tax_billing?: string | null;
  management_billing?: string | null;
  works_bidding?: boolean | null;
  dissatisfaction?: string | null;
  registered_collabortors?: number | null;
  unregistered_collabortors?: number | null;
  esocial?: boolean | null;
  how_many_banks?: boolean | null;
  whitch_banks?: string | null;
  responsible_departments?: string | null;
  works_system?: boolean | null;
  system_name?: string | null;
  system_usage_time?: string | null;
  system_value?: string | null;
  system_contact?: string | null;
  system_operations?: string | null;
  cloud_storage?: boolean | null;
  which_cloud_storage?: string | null;
  rental_agreement?: boolean | null;
  assessment_regime?: string | null;
  permit?: string | null;
  services?: string | null;
};

const paSelect = {
  client_id: true,
  activities: true,
  tax_billing: true,
  management_billing: true,
  works_bidding: true,
  dissatisfaction: true,
  registered_collabortors: true,
  unregistered_collabortors: true,
  esocial: true,
  how_many_banks: true,
  whitch_banks: true,
  responsible_departments: true,
  works_system: true,
  system_name: true,
  system_usage_time: true,
  system_value: true,
  system_contact: true,
  system_operations: true,
  cloud_storage: true,
  which_cloud_storage: true,
  rental_agreement: true,
  assessment_regime: true,
  permit: true,
  services: true,
} as const;

const paDetailSelect = {
  ...paSelect,
  client: {
    select: {
      company_name: true,
      cpf_cnpj: true,
      responsible: true,
      opening_date: true,
      number: true,
      register_date_prospecting: true,
      participants_meet: true,
      email: true,
      meet_type: true,
      indication: true,
      instagram: true,
      regime: true,
      cnae: true,
      cnae_secondary: true,
      contabil: true,
      fiscal: true,
      pessoal: true,
      infoproduto: true,
      consultoria: true,
      castelo_med: true,
    },
  },
} as const;

async function ensureClientExists(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organization_id: organizationId },
    select: { id: true },
  });

  if (!client) {
    throw new ServiceError(404, "Cliente nao encontrado.");
  }
}

export async function createClientPA(
  prisma: PrismaClient,
  organizationId: string,
  input: CreateClientPAInput,
): Promise<Record<string, unknown>> {
  await ensureClientExists(prisma, input.client_id, organizationId);

  const exists = await prisma.pA.findFirst({
    where: {
      client_id: input.client_id,
      organization_id: organizationId,
    },
    select: { client_id: true },
  });

  if (exists) {
    throw new ServiceError(409, "PA ja cadastrado para este cliente.");
  }

  const created = await prisma.pA.create({
    data: {
      client_id: input.client_id,
      organization_id: organizationId,
    },
    select: paSelect,
  });

  return created as Record<string, unknown>;
}

export async function getClientPADetail(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
): Promise<Record<string, unknown> | null> {
  await ensureClientExists(prisma, clientId, organizationId);

  const detail = await prisma.pA.findFirst({
    where: {
      client_id: clientId,
      organization_id: organizationId,
    },
    select: paDetailSelect,
  });

  return detail as Record<string, unknown> | null;
}

export async function updateClientPA(
  prisma: PrismaClient,
  clientId: string,
  organizationId: string,
  input: UpdateClientPAInput,
): Promise<Record<string, unknown>> {
  const exists = await prisma.pA.findFirst({
    where: {
      client_id: clientId,
      organization_id: organizationId,
    },
    select: { client_id: true },
  });

  if (!exists) {
    throw new ServiceError(404, "PA nao encontrado.");
  }

  const data: Record<string, unknown> = {};

  if (input.activities !== undefined) {
    data.activities = input.activities;
  }

  if (input.tax_billing !== undefined) {
    data.tax_billing = input.tax_billing;
  }

  if (input.management_billing !== undefined) {
    data.management_billing = input.management_billing;
  }

  if (input.works_bidding !== undefined) {
    data.works_bidding = input.works_bidding;
  }

  if (input.dissatisfaction !== undefined) {
    data.dissatisfaction = input.dissatisfaction;
  }

  if (input.registered_collabortors !== undefined) {
    data.registered_collabortors = input.registered_collabortors;
  }

  if (input.unregistered_collabortors !== undefined) {
    data.unregistered_collabortors = input.unregistered_collabortors;
  }

  if (input.esocial !== undefined) {
    data.esocial = input.esocial;
  }

  if (input.how_many_banks !== undefined) {
    data.how_many_banks = input.how_many_banks;
  }

  if (input.whitch_banks !== undefined) {
    data.whitch_banks = input.whitch_banks;
  }

  if (input.responsible_departments !== undefined) {
    data.responsible_departments = input.responsible_departments;
  }

  if (input.works_system !== undefined) {
    data.works_system = input.works_system;
  }

  if (input.system_name !== undefined) {
    data.system_name = input.system_name;
  }

  if (input.system_usage_time !== undefined) {
    data.system_usage_time = input.system_usage_time;
  }

  if (input.system_value !== undefined) {
    data.system_value = input.system_value;
  }

  if (input.system_contact !== undefined) {
    data.system_contact = input.system_contact;
  }

  if (input.system_operations !== undefined) {
    data.system_operations = input.system_operations;
  }

  if (input.cloud_storage !== undefined) {
    data.cloud_storage = input.cloud_storage;
  }

  if (input.which_cloud_storage !== undefined) {
    data.which_cloud_storage = input.which_cloud_storage;
  }

  if (input.rental_agreement !== undefined) {
    data.rental_agreement = input.rental_agreement;
  }

  if (input.assessment_regime !== undefined) {
    data.assessment_regime = input.assessment_regime;
  }

  if (input.permit !== undefined) {
    data.permit = input.permit;
  }

  if (input.services !== undefined) {
    data.services = input.services;
  }

  if (Object.keys(data).length === 0) {
    throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
  }

  const updated = await prisma.pA.update({
    where: { client_id: clientId },
    data,
    select: paSelect,
  });

  return updated as Record<string, unknown>;
}
