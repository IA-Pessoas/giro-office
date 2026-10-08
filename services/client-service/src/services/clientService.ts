import {
  INTEGRACAO_PERMISSION_LEVEL,
  type IntegracaoServiceAuthorization,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import {
  type ClientListStatus,
  type CreateClientBody,
  type ListClientsFilters,
  mapSimpleListStatusToDb,
  type UpdateClientBody,
} from "../schemas/client.schemas.js";
import {
  assertValidClientDocument,
  isClientDocumentUniqueConstraintError,
} from "../utils/clientDocuments.js";
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

type ClientPublicExtraValue = string | number | boolean | null;

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
} & Partial<Record<(typeof EXTENDED_CLIENT_KEYS)[number], ClientPublicExtraValue>>;

export type ClientListPage = {
  items: ClientPublic[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ClientInstagramProfile = {
  id: string;
  name: string;
  status: string;
  instagram: string | null;
};

export type ClientInstagramProfilePage = {
  items: ClientInstagramProfile[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ListInstagramProfilesFilters = {
  page: number;
  pageSize: number;
  profile: "all" | "with" | "without";
  search?: string;
};

type ClientAuthorization = IntegracaoServiceAuthorization & {
  userId: string;
  hasClientListAccess?: boolean;
  permission?: number;
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

const clientCreateSelect = {
  ...clientSelect,
  regime: true,
} satisfies Prisma.ClientSelect;

type ClientRow = Prisma.ClientGetPayload<{
  select: typeof clientSelect;
}>;

type ClientCreateRow = Prisma.ClientGetPayload<{
  select: typeof clientCreateSelect;
}>;

const clientDetailSelect = {
  ...clientSelect,
  dominio_code: true,
  address: true,
  cep: true,
  neighborhood: true,
  state: true,
  city: true,
  customer_since: true,
  municipal_registration: true,
  state_registration: true,
  commercial_board_registration: true,
  competence_entry: true,
  competence_output: true,
  opening_date: true,
  instagram: true,
  indication: true,
  regime: true,
  size: true,
  segment: true,
  coringa_status: true,
  tecnologia: true,
  licitacao: true,
  start_strike: true,
  end_strike: true,
  cnae: true,
  cnae_secondary: true,
  responsible: true,
  cpf_responsible: true,
  agent: true,
  cpf_agent: true,
  number: true,
  email: true,
  contabil: true,
  fiscal: true,
  pessoal: true,
  infoproduto: true,
  consultoria: true,
  castelo_med: true,
  contract: true,
  date_status: true,
  description_prospecting: true,
  participants_meet: true,
  meet_type: true,
  register_date_prospecting: true,
} satisfies Prisma.ClientSelect;

type ClientDetailRow = Prisma.ClientGetPayload<{
  select: typeof clientDetailSelect;
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
  "coringa_status",
  "tecnologia",
  "licitacao",
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

function serializePublicExtra(value: unknown): ClientPublicExtraValue {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return null;
}

function appendPublicExtras(row: ClientRow | ClientDetailRow, out: ClientPublic): ClientPublic {
  const source = row as Record<string, unknown>;

  for (const key of EXTENDED_CLIENT_KEYS) {
    if (key in source) {
      out[key] = serializePublicExtra(source[key]);
    }
  }

  return out;
}

function toPublic(
  row: ClientRow | ClientCreateRow | ClientDetailRow,
  organization: OrganizationPublic,
): ClientPublic {
  return appendPublicExtras(row, {
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
  });
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
  listByOrganization(
    organizationId: string,
    filters: ListClientsFilters,
    authorization?: ClientAuthorization,
  ): Promise<ClientListPage>;
  listInstagramProfiles(
    organizationId: string,
    filters: ListInstagramProfilesFilters,
  ): Promise<ClientInstagramProfilePage>;
  getById(
    id: string,
    organizationId: string,
    authorization?: ClientAuthorization,
  ): Promise<ClientPublic>;
  create(
    input: CreateClientBody & { organization_id: string },
    authorization?: ClientAuthorization,
  ): Promise<ClientPublic>;
  update(
    id: string,
    organizationId: string,
    input: UpdateClientBody,
    authorization?: ClientAuthorization,
  ): Promise<ClientPublic>;
  deactivate(
    id: string,
    organizationId: string,
    authorization?: ClientAuthorization,
  ): Promise<ClientPublic>;
  activate(
    id: string,
    organizationId: string,
    authorization?: ClientAuthorization,
  ): Promise<ClientPublic>;
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
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientListPage> {
    const hasClientListAccess =
      authorization.hasClientListAccess === true ||
      authorization.isOwner ||
      (authorization.permission ?? 0) >= 1 ||
      authorization.level >= INTEGRACAO_PERMISSION_LEVEL.VIEWER;

    if (!hasClientListAccess) {
      throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
    }

    const statusWhere = buildListStatusWhere(filters);
    const where = mergeClientListSearchWhere(
      { organization_id: organizationId, ...(statusWhere ?? {}) },
      filters.search,
    );
    const skip = (filters.page - 1) * filters.pageSize;
    const take = filters.pageSize;

    const organization = await this.getOrganizationPublic(organizationId);
    const rows = await this.prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      select: clientSelect,
    });
    const total = await this.prisma.client.count({ where });

    const hasMore = filters.page * filters.pageSize < total;

    return {
      items: rows.map((row) => toPublic(row, organization)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore,
    };
  }

  async listInstagramProfiles(
    organizationId: string,
    filters: ListInstagramProfilesFilters,
  ): Promise<ClientInstagramProfilePage> {
    const search = filters.search?.trim();
    const profileCondition =
      filters.profile === "with"
        ? Prisma.sql`AND c.instagram ~ '[^[:space:]]'`
        : filters.profile === "without"
          ? Prisma.sql`AND (c.instagram IS NULL OR c.instagram ~ '^[[:space:]]*$')`
          : Prisma.empty;
    const searchCondition = search
      ? Prisma.sql`AND (
          c.name ILIKE ${`%${search}%`}
          OR c.company_name ILIKE ${`%${search}%`}
          OR c.fantasy_name ILIKE ${`%${search}%`}
        )`
      : Prisma.empty;
    const where = Prisma.sql`WHERE c.organization_id = ${organizationId} ${profileCondition} ${searchCondition}`;
    const skip = (filters.page - 1) * filters.pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<ClientInstagramProfile[]>(Prisma.sql`
        SELECT c.id, c.name, c.status, c.instagram
        FROM clients c
        ${where}
        ORDER BY c.name ASC, c.id ASC
        LIMIT ${filters.pageSize}
        OFFSET ${skip}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM clients c
        ${where}
      `),
    ]);
    const total = Number(totals[0]?.total ?? 0);

    return {
      items: rows,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore: filters.page * filters.pageSize < total,
    };
  }

  async getById(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientPublic> {
    const row = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientDetailSelect,
    });

    if (!row) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    requireIntegracaoRouteAccess("GET", "/client/:id", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId,
      resourceOrganizationId: row.organization_id,
      isOwner: authorization.isOwner,
    });

    const organization = await this.getOrganizationPublic(organizationId);
    return toPublic(row, organization);
  }

  async create(
    input: CreateClientBody & { organization_id: string },
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientPublic> {
    requireIntegracaoRouteAccess("POST", "/client", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId: input.organization_id,
      resourceOrganizationId: input.organization_id,
      isOwner: authorization.isOwner,
      requestedFields: Object.keys(input).filter((field) => field !== "organization_id"),
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organization_id },
      select: { id: true },
    });
    if (!org) {
      throw new ServiceError(400, "Organização não encontrada.");
    }
    const normalizedDocument = assertValidClientDocument(input.cpf_cnpj, input.type);
    const duplicate = await this.prisma.client.findFirst({
      where: { organization_id: input.organization_id, cpf_cnpj: normalizedDocument },
      select: { id: true },
    });
    if (duplicate) {
      throw new ServiceError(409, "Cliente já cadastrado.");
    }
    const extended = takeExtendedFields(input);

    try {
      const [organization, row] = await Promise.all([
        this.getOrganizationPublic(input.organization_id),
        this.prisma.client.create({
          data: {
            name: input.name,
            organization_id: input.organization_id,
            status: input.status,
            cpf_cnpj: normalizedDocument,
            company_name: input.company_name ?? null,
            fantasy_name: input.fantasy_name ?? null,
            prospecting_status: input.prospecting_status,
            type: input.type,
            type_registration: input.type_registration,
            service_unique: input.service_unique,
            ...extended,
          } as Prisma.ClientUncheckedCreateInput,
          select: clientCreateSelect,
        }),
      ]);

      return toPublic(row, organization);
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error)) {
        throw new ServiceError(409, "Cliente já cadastrado.", error);
      }
      throw error;
    }
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateClientBody,
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, type: true, cpf_cnpj: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }

    requireIntegracaoRouteAccess("PATCH", "/client/:id", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId,
      resourceOrganizationId: organizationId,
      isOwner: authorization.isOwner,
      requestedFields: Object.keys(input),
    });

    const extended = takeExtendedFields(input);
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.status !== undefined) {
      data.status = input.status;
    }

    if (input.cpf_cnpj !== undefined) {
      const normalizedDocument = assertValidClientDocument(
        input.cpf_cnpj,
        input.type ?? existing.type,
      );
      const duplicate = await this.prisma.client.findFirst({
        where: {
          organization_id: organizationId,
          cpf_cnpj: normalizedDocument,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ServiceError(409, "Cliente já cadastrado.");
      }
      data.cpf_cnpj = normalizedDocument;
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

    try {
      const [organization, row] = await Promise.all([
        this.getOrganizationPublic(organizationId),
        this.prisma.client.update({
          where: { id },
          data: data as Prisma.ClientUncheckedUpdateInput,
          select: clientSelect,
        }),
      ]);

      return toPublic(row, organization);
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error)) {
        throw new ServiceError(409, "Cliente já cadastrado.", error);
      }
      throw error;
    }
  }

  async deactivate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    requireIntegracaoRouteAccess("DELETE", "/client/:id", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId,
      resourceOrganizationId: organizationId,
      isOwner: authorization.isOwner,
    });
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

  async activate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization = {
      userId: "",
      level: INTEGRACAO_PERMISSION_LEVEL.BASIC,
      isOwner: false,
    },
  ): Promise<ClientPublic> {
    const existing = await this.prisma.client.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new ServiceError(404, "Cliente não encontrado.");
    }
    requireIntegracaoRouteAccess("POST", "/client/:id/activate", {
      userId: authorization.userId,
      level: authorization.level,
      organizationId,
      resourceOrganizationId: organizationId,
      isOwner: authorization.isOwner,
    });
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
