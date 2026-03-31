import { ServiceError } from "@workspace/shared";
import type { PrismaClient } from "../generated/prisma/client.js";

import type { CreateClientBody, UpdateClientBody } from "../schemas/client.schema.js";

export type ClientPublic = {
  id: string;
  name: string;
  organization_id: string;
  status: string;
  cpf_cnpj: string;
  company_name: string | null;
  fantasy_name: string | null;
  service_unique: boolean | null;
};

export interface IClientService {
  listByOrganization(organizationId: string): Promise<ClientPublic[]>;
  getById(id: string, organizationId: string): Promise<ClientPublic>;
  create(input: CreateClientBody): Promise<ClientPublic>;
  update(id: string, organizationId: string, input: UpdateClientBody): Promise<ClientPublic>;
}

const clientSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
} as const;

function toPublic(row: {
  id: string;
  name: string;
  organization_id: string;
  status: string;
  cpf_cnpj: string;
  company_name: string | null;
  fantasy_name: string | null;
  service_unique: boolean | null;
}): ClientPublic {
  return {
    id: row.id,
    name: row.name,
    organization_id: row.organization_id,
    status: row.status,
    cpf_cnpj: row.cpf_cnpj,
    company_name: row.company_name,
    fantasy_name: row.fantasy_name,
    service_unique: row.service_unique,
  };
}

export class ClientService implements IClientService {
  constructor(private readonly prisma: PrismaClient) {}

  async listByOrganization(organizationId: string): Promise<ClientPublic[]> {
    const rows = await this.prisma.client.findMany({
      where: { organization_id: organizationId },
      select: clientSelect,
      orderBy: { name: "asc" },
    });
    return rows.map(toPublic);
  }

  async getById(id: string, organizationId: string): Promise<ClientPublic> {
    const row = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientSelect,
    });
    if (!row) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    return toPublic(row);
  }

  async create(input: CreateClientBody): Promise<ClientPublic> {
    const row = await this.prisma.client.create({
      data: {
        name: input.name,
        organization_id: input.organization_id,
        status: input.status,
        cpf_cnpj: input.cpf_cnpj ?? "",
        company_name: input.company_name ?? null,
        fantasy_name: input.fantasy_name ?? null,
        prospecting_status: input.prospecting_status ?? "Lead",
        type: input.type ?? "PJ",
        type_registration: input.type_registration ?? "Novo",
        service_unique: input.service_unique,
      },
      select: clientSelect,
    });
    return toPublic(row);
  }

  async update(id: string, organizationId: string, input: UpdateClientBody): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    const row = await this.prisma.client.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.cpf_cnpj !== undefined ? { cpf_cnpj: input.cpf_cnpj } : {}),
        ...(input.company_name !== undefined ? { company_name: input.company_name } : {}),
        ...(input.fantasy_name !== undefined ? { fantasy_name: input.fantasy_name } : {}),
        ...(input.prospecting_status !== undefined
          ? { prospecting_status: input.prospecting_status }
          : {}),
        ...(input.service_unique !== undefined ? { service_unique: input.service_unique } : {}),
      },
      select: clientSelect,
    });
    return toPublic(row);
  }
}
