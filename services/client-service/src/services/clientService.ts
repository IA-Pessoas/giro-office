import { ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import {
  type ClientListStatus,
  type CreateClientBody,
  type ListClientsFilters,
  mapSimpleListStatusToDb,
  type UpdateClientBody,
} from "../schemas/client.schemas.js";
import {
  buildLegacyListStatusWhere,
  mergeClientListSearchWhere,
} from "./clientListQueryService.js";

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

type OrganizationRow = Prisma.OrganizationGetPayload<{
  select: typeof organizationSelect;
}>;

const clientSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
  deletion_date: true,
} satisfies Prisma.ClientSelect;

type ClientRow = Prisma.ClientGetPayload<{
  select: typeof clientSelect;
}>;

const EXTENDED_CLIENT_KEYS = [
  "dominio_code",
  "address",
  "cep",
  "neighborhood",
  "state",
  "city",
  "customer_since",
  "municipal_registration",
  "state_registration",
  "commercial_board_registration",
  "competence_entry",
  "competence_output",
  "opening_date",
  "instagram",
  "indication",
  "regime",
  "size",
  "segment",
  "start_strike",
  "end_strike",
  "cnae",
  "cnae_secondary",
  "responsible",
  "cpf_responsible",
  "agent",
  "cpf_agent",
  "number",
  "email",
  "contabil",
  "fiscal",
  "pessoal",
  "infoproduto",
  "consultoria",
  "castelo_med",
  "contract",
  "date_status",
  "description_prospecting",
  "participants_meet",
  "meet_type",
  "register_date_prospecting",
] as const;

function takeExtendedFields(input: CreateClientBody | UpdateClientBody): Record<string, unknown> {
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of EXTENDED_CLIENT_KEYS) {
    if (src[k] !== undefined) {
      out[k] = src[k];
    }
  }
  return out;
}

function toOrganizationPublic(row: OrganizationRow): OrganizationPublic {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    status: row.status,
    subscription_plan: row.subscription_plan,
  };
}

function toPublic(row: ClientRow, organization: OrganizationPublic): ClientPublic {
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
    organization,
  };
}

function buildListStatusWhere(filters: ListClientsFilters): Prisma.ClientWhereInput | undefined {
  const st = filters.status;
  if (!st || st === "Todos") {
    return undefined;
  }
  if (!filters.ref) {
    return { status: mapSimpleListStatusToDb(st as ClientListStatus) };
  }
  return buildLegacyListStatusWhere(filters.ref, st);
}

export interface IClientService {
  listByOrganization(organizationId: string, filters: ListClientsFilters): Promise<ClientListPage>;
  getById(id: string, organizationId: string): Promise<ClientPublic | null>;
  create(input: CreateClientBody & { organization_id: string }): Promise<ClientPublic>;
  update(id: string, organizationId: string, input: UpdateClientBody): Promise<ClientPublic>;
  deactivate(id: string, organizationId: string): Promise<ClientPublic>;
  activate(id: string, organizationId: string): Promise<ClientPublic>;
}

export class ClientService implements IClientService {
  constructor(private readonly prisma: PrismaClient) {}

  private async getOrganizationPublic(
    organizationId: string,
    notFoundStatusCode = 404,
  ): Promise<OrganizationPublic> {
    const row = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });

    if (!row) {
      throw new ServiceError(notFoundStatusCode, "Organização não encontrada.");
    }

    return toOrganizationPublic(row);
  }

  async listByOrganization(
    organizationId: string,
    filters: ListClientsFilters,
  ): Promise<ClientListPage> {
    const statusWhere = buildListStatusWhere(filters);
    const where = mergeClientListSearchWhere(
      { organization_id: organizationId, ...(statusWhere ?? {}) },
      filters.search,
    );
    const skip = (filters.page - 1) * filters.pageSize;
    const take = filters.pageSize;

    const [organization, rows, total] = await Promise.all([
      this.getOrganizationPublic(organizationId),
      this.prisma.client.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        select: clientSelect,
      }),
      this.prisma.client.count({ where }),
    ]);

    const hasMore = filters.page * filters.pageSize < total;

    return {
      items: rows.map((row) => toPublic(row, organization)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore,
    };
  }

  async getById(id: string, organizationId: string): Promise<ClientPublic | null> {
    const row = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientSelect,
    });

    if (!row) {
      return null;
    }

    const organization = await this.getOrganizationPublic(organizationId);
    return toPublic(row, organization);
  }

  async create(input: CreateClientBody & { organization_id: string }): Promise<ClientPublic> {
    const org = await this.prisma.organization.findUnique({
      where: { id: input.organization_id },
      select: { id: true },
    });
    if (!org) {
      throw new ServiceError(400, "Organização não encontrada.");
    }
    const extended = takeExtendedFields(input);

    const [organization, row] = await Promise.all([
      this.getOrganizationPublic(input.organization_id),
      this.prisma.client.create({
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
          ...extended,
        } as Prisma.ClientUncheckedCreateInput,
        select: clientSelect,
      }),
    ]);

    return toPublic(row, organization);
  }

  async update(id: string, organizationId: string, input: UpdateClientBody): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    const extended = takeExtendedFields(input);
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.status !== undefined) {
      data.status = input.status;
    }

    if (input.cpf_cnpj !== undefined) {
      data.cpf_cnpj = input.cpf_cnpj;
    }

    if (input.company_name !== undefined) {
      data.company_name = input.company_name;
    }

    if (input.fantasy_name !== undefined) {
      data.fantasy_name = input.fantasy_name;
    }

    if (input.prospecting_status !== undefined) {
      data.prospecting_status = input.prospecting_status;
    }

    if (input.service_unique !== undefined) {
      data.service_unique = input.service_unique;
    }

    if (input.type !== undefined) {
      data.type = input.type;
    }

    if (input.type_registration !== undefined) {
      data.type_registration = input.type_registration;
    }

    Object.assign(data, extended);

    const [organization, row] = await Promise.all([
      this.getOrganizationPublic(organizationId),
      this.prisma.client.update({
        where: { id },
        data: data as Prisma.ClientUncheckedUpdateInput,
        select: clientSelect,
      }),
    ]);

    return toPublic(row, organization);
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

    const [organization, row] = await Promise.all([
      this.getOrganizationPublic(organizationId),
      this.prisma.client.update({
        where: { id },
        data: { status: "Inativo", deletion_date: new Date() },
        select: clientSelect,
      }),
    ]);

    return toPublic(row, organization);
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

    const [organization, row] = await Promise.all([
      this.getOrganizationPublic(organizationId),
      this.prisma.client.update({
        where: { id },
        data: { status: "Ativo", deletion_date: null },
        select: clientSelect,
      }),
    ]);

    return toPublic(row, organization);
  }
}
