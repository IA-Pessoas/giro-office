import { ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  CreateClientBody,
  ListClientsFilters,
  UpdateClientBody,
} from "../schemas/client.schema.js";

export type OrganizationPublic = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  subscription_plan: string;
};

export type ClientPublic = {
  id: string;
  name: string;
  organization_id: string;
  status: string;
  cpf_cnpj: string;
  company_name: string | null;
  fantasy_name: string | null;
  service_unique: boolean;
  deletion_date: string | null;
  organization: OrganizationPublic;
};

export type ClientListPage = {
  items: ClientPublic[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  status: true,
  subscription_plan: true,
} satisfies Prisma.OrganizationSelect;

export const clientWithOrganizationSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
  deletion_date: true,
  organization: { select: organizationSelect },
} satisfies Prisma.ClientSelect;

type ClientRowWithOrganization = Prisma.ClientGetPayload<{
  select: typeof clientWithOrganizationSelect;
}>;

function toPublic(row: ClientRowWithOrganization): ClientPublic {
  return {
    id: row.id,
    name: row.name,
    organization_id: row.organization_id,
    status: row.status,
    cpf_cnpj: row.cpf_cnpj,
    company_name: row.company_name,
    fantasy_name: row.fantasy_name,
    service_unique: row.service_unique ?? false,
    deletion_date: row.deletion_date ? row.deletion_date.toISOString() : null,
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      logo_url: row.organization.logo_url,
      status: row.organization.status,
      subscription_plan: row.organization.subscription_plan,
    },
  };
}

function buildListSearchWhere(search: string | undefined): Prisma.ClientWhereInput {
  const term = search?.trim();
  if (!term) {
    return {};
  }
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { company_name: { contains: term, mode: "insensitive" } },
      { fantasy_name: { contains: term, mode: "insensitive" } },
      { cpf_cnpj: { contains: term, mode: "insensitive" } },
    ],
  };
}

export interface IClientService {
  listByOrganization(organizationId: string, filters: ListClientsFilters): Promise<ClientListPage>;
  getById(id: string, organizationId: string): Promise<ClientPublic | null>;
  create(input: CreateClientBody): Promise<ClientPublic>;
  update(id: string, organizationId: string, input: UpdateClientBody): Promise<ClientPublic>;
  deactivate(id: string, organizationId: string): Promise<ClientPublic>;
  activate(id: string, organizationId: string): Promise<ClientPublic>;
}

export class ClientService implements IClientService {
  constructor(private readonly prisma: PrismaClient) {}

  async listByOrganization(
    organizationId: string,
    filters: ListClientsFilters,
  ): Promise<ClientListPage> {
    const where: Prisma.ClientWhereInput = {
      organization_id: organizationId,
      ...(filters.statusDbValue !== undefined ? { status: filters.statusDbValue } : {}),
      ...buildListSearchWhere(filters.search),
    };
    const skip = (filters.page - 1) * filters.pageSize;
    const take = filters.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        select: clientWithOrganizationSelect,
      }),
      this.prisma.client.count({ where }),
    ]);

    const hasMore = filters.page * filters.pageSize < total;

    return {
      items: rows.map(toPublic),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore,
    };
  }

  async getById(id: string, organizationId: string): Promise<ClientPublic | null> {
    const row = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientWithOrganizationSelect,
    });
    return row ? toPublic(row) : null;
  }

  async create(input: CreateClientBody): Promise<ClientPublic> {
    const org = await this.prisma.organization.findUnique({
      where: { id: input.organization_id },
      select: { id: true },
    });
    if (!org) {
      throw new ServiceError(400, "Organização não encontrada.");
    }

    const row = await this.prisma.client.create({
      data: {
        name: input.name,
        organization_id: input.organization_id,
        status: input.status,
        cpf_cnpj: input.cpf_cnpj,
        company_name: input.company_name ?? null,
        fantasy_name: input.fantasy_name ?? null,
        prospecting_status: input.prospecting_status,
        type: input.type,
        type_registration: input.type_registration,
        service_unique: input.service_unique,
      },
      select: clientWithOrganizationSelect,
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
      select: clientWithOrganizationSelect,
    });

    return toPublic(row);
  }

  async deactivate(id: string, organizationId: string): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    if (existing.status === "Inativo") {
      throw new ServiceError(409, "Cliente já está inativo.");
    }

    const row = await this.prisma.client.update({
      where: { id },
      data: { status: "Inativo", deletion_date: new Date() },
      select: clientWithOrganizationSelect,
    });

    return toPublic(row);
  }

  async activate(id: string, organizationId: string): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    if (existing.status === "Ativo") {
      throw new ServiceError(409, "Cliente já está ativo.");
    }

    const row = await this.prisma.client.update({
      where: { id },
      data: { status: "Ativo", deletion_date: null },
      select: clientWithOrganizationSelect,
    });

    return toPublic(row);
  }
}
