import {
  clientIntegrationReportingCatalog,
  executeReportingQuery,
  getClientIntegrationReportingFields,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import { lookupOfficialCnpj } from "./cnpjLookup.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { WorkerHistoryStorageLike } from "./historyStorage.js";

export type ClientAuthorization = {
  userId: string;
  level: number;
  modules?: Record<string, number>;
  permission?: number;
  isOwner: boolean;
};

export type ClientFilters = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  ref?: "integracao" | "deps";
};

export type ClientWorkerService = {
  listByOrganization: (
    organizationId: string,
    filters: ClientFilters,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  getById: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  create: (input: Record<string, unknown>, authorization: ClientAuthorization) => Promise<unknown>;
  update: (
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  deactivate: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  activate: (
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  lookupCnpj: (cnpj: string, organizationId: string) => Promise<unknown>;
  createIntegration: (
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  updateIntegration: (
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listHistories: (clientId: string, organizationId: string) => Promise<unknown>;
  createHistory: (
    clientId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string; pending_id?: string; file?: string | null },
  ) => Promise<unknown>;
  getHistory: (clientId: string, historyId: string, organizationId: string) => Promise<unknown>;
  getHistoryFileUrl: (
    clientId: string,
    historyId: string,
    organizationId: string,
  ) => Promise<unknown>;
  updateHistory: (
    historyId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string },
  ) => Promise<unknown>;
  createPending: (
    clientId: string,
    organizationId: string,
    userId: string,
    reason: string,
  ) => Promise<unknown>;
  listPending: (organizationId: string, userId?: string) => Promise<unknown>;
  deletePending: (pendingId: string, organizationId: string) => Promise<void>;
  deleteHistory: (
    clientId: string,
    historyId: string,
    organizationId: string,
    userId: string,
    canManage: boolean,
  ) => Promise<void>;
  createPA: (clientId: string, organizationId: string) => Promise<unknown>;
  getPADetail: (clientId: string, organizationId: string) => Promise<unknown>;
  updatePA: (
    clientId: string,
    organizationId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  terminate: (
    clientId: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  updateFinance: (
    clientId: string,
    organizationId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  updateRegularize: (
    clientId: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  runCompetenceOutputUpdate: () => Promise<unknown>;
  applyCommercialProjection: (event: Record<string, unknown>) => Promise<unknown>;
  reportingCatalog: () => Promise<unknown>;
  extractReporting: (input: {
    organizationId: string;
    source: string;
    fields: readonly string[];
    limit: number;
    query?: unknown;
    offset?: number;
  }) => Promise<unknown>;
};

type ClientRow = Record<string, unknown>;

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  status: true,
  subscription_plan: true,
} as const;

const TERMINATED_STATUSES = new Set(["Inativo", "Processo de Inativação"]);

const clientSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
  responsible: true,
  email: true,
  deletion_date: true,
  type: true,
  type_registration: true,
  prospecting_status: true,
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
  start_strike: true,
  end_strike: true,
  cnae: true,
  cnae_secondary: true,
  cpf_responsible: true,
  agent: true,
  cpf_agent: true,
  number: true,
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
} as const;

const clientListSelect = {
  id: true,
  name: true,
  organization_id: true,
  status: true,
  cpf_cnpj: true,
  company_name: true,
  fantasy_name: true,
  service_unique: true,
  deletion_date: true,
} as const;

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

const OPEN_TASK_STATUSES = ["A Realizar", "Em andamento", "Em Espera", "Pendente"] as const;
const CLIENT_DOMAIN_MODULES = [
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "pessoal",
  "regularize",
] as const;

function requirePermission(auth: ClientAuthorization, minimum: number): void {
  if (!auth.isOwner && auth.level < minimum) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

function requireClientListPermission(auth: ClientAuthorization): void {
  const domainAccess = CLIENT_DOMAIN_MODULES.some((module) => (auth.modules?.[module] ?? 0) >= 1);
  if (!auth.isOwner && (auth.permission ?? 0) < 1 && auth.level < 1 && !domainAccess) {
    throw new ServiceError(403, "Usuário não possui permissão para este domínio.");
  }
}

function statusWhere(filters: ClientFilters): Record<string, unknown> | undefined {
  const status = filters.status;
  if (!status || status === "Todos") return undefined;
  if (!filters.ref) return { status: status === "Prospect" ? "Prospecção" : status };
  if (filters.ref === "integracao") {
    if (status === "Ativo" || status === "Inativo") {
      return { AND: [{ status }, { dominio_code: { not: null } }, { dominio_code: { not: "" } }] };
    }
    if (status === "Ativo e Prospecção") return { status: { in: ["Fechado", "Prospecção"] } };
    if (
      [
        "Ativo PJ",
        "Prospecção PJ",
        "Inativo PJ",
        "Ativo PF",
        "Prospecção PF",
        "Inativo PF",
      ].includes(status)
    ) {
      const [statusPart, type] = status.split(" ");
      return { status: statusPart, type };
    }
    if (status === "Não Contradados e Paralisados" || status === "Não Contradado e Paralisado") {
      return { prospecting_status: { in: ["Paralisado", "Recusado pelo Cliente"] } };
    }
    return { status };
  }
  if (filters.ref === "deps") {
    const department = status.split(" ")[1];
    if (
      status.startsWith("Departamento ") &&
      department &&
      ["contabil", "fiscal", "pessoal", "infoproduto", "consultoria", "castelo_med"].includes(
        department,
      )
    ) {
      return { [department]: true, status: "Ativo" };
    }
  }
  return undefined;
}

function cleanCnpj(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanDocument(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function toPublic(row: ClientRow, organization: ClientRow): ClientRow {
  return Object.fromEntries(
    Object.entries({
      ...row,
      service_unique: row.service_unique ?? false,
      deletion_date: serialize(row.deletion_date ?? null),
      organization,
    }).map(([key, value]) => [key, serialize(value)]),
  );
}

export class ClientService implements ClientWorkerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cnpjLookupApiUrl?: string,
    private readonly cnpjLookupApiToken?: string,
    private readonly historyStorage?: WorkerHistoryStorageLike,
    private readonly inReportingSnapshot = false,
  ) {}

  private async organization(organizationId: string): Promise<ClientRow> {
    const row = await (this.prisma as any).organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
    if (!row) throw new ServiceError(404, "Organização não encontrada.");
    return row;
  }

  private async client(id: string, organizationId: string): Promise<ClientRow> {
    const row = await (this.prisma as any).client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientSelect,
    });
    if (!row) throw new ServiceError(404, "Cliente não encontrado.");
    return row;
  }

  async listByOrganization(
    organizationId: string,
    filters: ClientFilters,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireClientListPermission(authorization);
    const where: Record<string, unknown> = {
      organization_id: organizationId,
      ...(statusWhere(filters) ?? {}),
    };
    if (filters.search?.trim()) {
      const term = filters.search.trim();
      const search = {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { company_name: { contains: term, mode: "insensitive" } },
          { fantasy_name: { contains: term, mode: "insensitive" } },
          { cpf_cnpj: { contains: term, mode: "insensitive" } },
        ],
      };
      Object.assign(
        where,
        Object.keys(where).length > 1 ? { AND: [{ ...where }, search] } : search,
      );
    }
    const organization = await this.organization(organizationId);
    const rows = await (this.prisma as any).client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: clientListSelect,
    });
    const total = await (this.prisma as any).client.count({ where });
    return {
      items: rows.map((row: ClientRow) => toPublic(row, organization)),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasMore: filters.page * filters.pageSize < total,
    };
  }

  async getById(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 1);
    const row = await (this.prisma as any).client.findFirst({
      where: { id, organization_id: organizationId },
      select: clientSelect,
    });
    if (!row) throw new ServiceError(404, "Cliente não encontrado.");
    return toPublic(row, await this.organization(organizationId));
  }

  async create(
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const organizationId = String(input.organization_id);
    const organization = await this.organization(organizationId);
    const row = await (this.prisma as any).client.create({
      data: { ...input, organization_id: organizationId },
      select: clientSelect,
    });
    return toPublic(row, organization);
  }

  async update(
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    await this.client(id, organizationId);
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: input,
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async deactivate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 3);
    const existing = await this.client(id, organizationId);
    if (existing.status === "Inativo") throw new ServiceError(409, "Cliente já está inativo.");
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: { status: "Inativo", deletion_date: new Date() },
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async activate(
    id: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 3);
    const existing = await this.client(id, organizationId);
    if (existing.status === "Ativo") throw new ServiceError(409, "Cliente já está ativo.");
    const row = await (this.prisma as any).client.update({
      where: { id },
      data: { status: "Ativo", deletion_date: null },
      select: clientSelect,
    });
    return toPublic(row, await this.organization(organizationId));
  }

  async lookupCnpj(cnpj: string, _organizationId: string): Promise<unknown> {
    return lookupOfficialCnpj(cnpj, this.cnpjLookupApiUrl, this.cnpjLookupApiToken);
  }

  async createIntegration(
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const organizationId = String(input.organization_id);
    const cpfCnpj = cleanCnpj(String(input.cpf_cnpj));
    const exists = await (this.prisma as any).client.findFirst({
      where: { cpf_cnpj: cpfCnpj, organization_id: organizationId },
      select: { id: true },
    });
    if (exists) throw new ServiceError(409, "Cliente já cadastrado.");
    return (this.prisma as any).client.create({
      data: {
        organization_id: organizationId,
        type: input.type,
        name: input.name,
        company_name: input.company_name ?? null,
        fantasy_name: input.fantasy_name ?? null,
        cpf_cnpj: cpfCnpj,
        opening_date: input.opening_date ?? null,
        responsible: input.responsible ?? null,
        cpf_responsible: cleanDocument(input.cpf_responsible as string | null | undefined),
        number: input.number ?? null,
        email: input.email ?? null,
        agent: input.agent ?? null,
        cpf_agent: cleanDocument(input.cpf_agent as string | null | undefined),
        instagram: input.instagram ?? null,
        indication: input.indication ?? null,
        participants_meet: input.participants_meet ?? null,
        meet_type: input.meet_type ?? null,
        type_registration: input.type_registration ?? "Novo",
        service_unique: input.service_unique ?? false,
        status: input.type_registration === "Novo" ? "Prospecção" : "Ativo",
        prospecting_status: input.type_registration === "Novo" ? "Análise/Agendamento" : "Fechado",
      },
      select: { id: true, name: true, cpf_cnpj: true },
    });
  }

  async updateIntegration(
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    await this.client(id, organizationId);
    const data: Record<string, unknown> = { ...input };
    if (data.cpf_cnpj !== undefined) data.cpf_cnpj = cleanCnpj(String(data.cpf_cnpj));
    if (data.cpf_responsible !== undefined)
      data.cpf_responsible = cleanDocument(String(data.cpf_responsible));
    if (data.cpf_agent !== undefined) data.cpf_agent = cleanDocument(String(data.cpf_agent));
    return (this.prisma as any).client.update({
      where: { id },
      data,
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
  }

  private async ensureClient(id: string, organizationId: string): Promise<void> {
    await this.client(id, organizationId);
  }

  async listHistories(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return {
      list: await (this.prisma as any).clientHistory.findMany({
        where: { client_id: clientId, organization_id: organizationId },
        orderBy: { date: "asc" },
        select: {
          id: true,
          client_id: true,
          date: true,
          history: true,
          file: true,
          user_id: true,
          user: { select: { name: true, department: { select: { name: true } } } },
        },
      }),
    };
  }

  async createHistory(
    clientId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string; pending_id?: string; file?: string | null },
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    const row = await (this.prisma as any).clientHistory.create({
      data: {
        client_id: clientId,
        organization_id: organizationId,
        user_id: userId,
        date: input.date,
        history: input.history,
        file: input.file ?? null,
      },
      select: {
        id: true,
        client_id: true,
        date: true,
        history: true,
        file: true,
        user_id: true,
      },
    });
    if (input.pending_id) {
      await (this.prisma as any).clientHistoryPending.deleteMany({
        where: { id: input.pending_id, client_id: clientId, organization_id: organizationId },
      });
    }
    return row;
  }

  async getHistory(clientId: string, historyId: string, organizationId: string): Promise<unknown> {
    const row = await (this.prisma as any).clientHistory.findFirst({
      where: { id: historyId, client_id: clientId, organization_id: organizationId },
      select: {
        id: true,
        client_id: true,
        date: true,
        history: true,
        file: true,
        user_id: true,
        user: { select: { name: true, department: { select: { name: true } } } },
        client: { select: { company_name: true, cpf_cnpj: true } },
      },
    });
    if (!row) throw new ServiceError(404, "Histórico não encontrado.");
    return { detail: row };
  }

  async getHistoryFileUrl(
    clientId: string,
    historyId: string,
    organizationId: string,
  ): Promise<unknown> {
    const row = (await this.getHistory(clientId, historyId, organizationId)) as {
      detail: ClientRow;
    };
    if (!row.detail.file) throw new ServiceError(404, "Anexo não encontrado.");
    if (/^https?:\/\//iu.test(String(row.detail.file))) return { url: row.detail.file };
    if (!this.historyStorage) throw new ServiceError(503, "Storage de históricos não configurado.");
    return { url: await this.historyStorage.createSignedAccessUrl(String(row.detail.file)) };
  }

  async updateHistory(
    historyId: string,
    organizationId: string,
    userId: string,
    input: { date: Date; history: string },
  ): Promise<unknown> {
    const existing = await (this.prisma as any).clientHistory.findFirst({
      where: { id: historyId, organization_id: organizationId },
      select: { id: true, user_id: true },
    });
    if (!existing) throw new ServiceError(404, "Histórico não encontrado.");
    if (existing.user_id !== userId)
      throw new ServiceError(403, "Usuário não tem permissão para editar este histórico.");
    return (this.prisma as any).clientHistory.update({
      where: { id: historyId },
      data: { date: input.date, history: input.history },
      select: { id: true, date: true, history: true, user_id: true },
    });
  }

  async createPending(
    clientId: string,
    organizationId: string,
    userId: string,
    reason: string,
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return (this.prisma as any).clientHistoryPending.create({
      data: { client_id: clientId, organization_id: organizationId, user_id: userId, reason },
      select: { id: true, user_id: true, client_id: true, reason: true },
    });
  }

  async listPending(organizationId: string, userId?: string): Promise<unknown> {
    return {
      list: await (this.prisma as any).clientHistoryPending.findMany({
        where: { organization_id: organizationId, ...(userId ? { user_id: userId } : {}) },
        select: {
          id: true,
          reason: true,
          client_id: true,
          client: { select: { company_name: true, cpf_cnpj: true } },
        },
      }),
    };
  }

  // Autor ou admin/owner exclui; o anexo sai do bucket depois que a linha some.
  async deleteHistory(
    clientId: string,
    historyId: string,
    organizationId: string,
    userId: string,
    canManage: boolean,
  ): Promise<void> {
    const existing = await (this.prisma as any).clientHistory.findFirst({
      where: { id: historyId, client_id: clientId, organization_id: organizationId },
      select: { id: true, user_id: true, file: true },
    });
    if (!existing) throw new ServiceError(404, "Histórico não encontrado.");
    if (!canManage && existing.user_id !== userId)
      throw new ServiceError(403, "Usuário não tem permissão para excluir este histórico.");
    await (this.prisma as any).clientHistory.delete({ where: { id: historyId } });
    if (existing.file && !/^https?:\/\//iu.test(String(existing.file))) {
      await this.historyStorage?.remove(String(existing.file)).catch(() => undefined);
    }
  }

  async deletePending(pendingId: string, organizationId: string): Promise<void> {
    const exists = await (this.prisma as any).clientHistoryPending.findFirst({
      where: { id: pendingId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) throw new ServiceError(404, "Pendência não encontrada.");
    await (this.prisma as any).clientHistoryPending.delete({ where: { id: pendingId } });
  }

  async createPA(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    const exists = await (this.prisma as any).pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: { client_id: true },
    });
    if (exists) throw new ServiceError(409, "PA já cadastrado para este cliente.");
    return (this.prisma as any).pA.create({
      data: { client_id: clientId, organization_id: organizationId },
      select: paSelect,
    });
  }

  async getPADetail(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return (this.prisma as any).pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: paDetailSelect,
    });
  }

  async updatePA(
    clientId: string,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const exists = await (this.prisma as any).pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: { client_id: true },
    });
    if (!exists) throw new ServiceError(404, "PA não encontrado.");
    if (Object.keys(input).length === 0)
      throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
    return (this.prisma as any).pA.update({
      where: { client_id: clientId },
      data: input,
      select: paSelect,
    });
  }

  async terminate(
    clientId: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const client = await this.client(clientId, organizationId);
    if (TERMINATED_STATUSES.has(String(client.status ?? "")))
      throw new ServiceError(409, "Cliente já está inativo ou em processo de inativação.");
    const competence = String(input.competence_output);
    const [year, month] = competence.split("-").map(Number);
    const competenceDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return (this.prisma as any).$transaction(async (tx: any) => {
      await tx.task.updateMany({
        where: {
          status: { in: [...OPEN_TASK_STATUSES] },
          client_id: clientId,
          organization_id: organizationId,
        },
        data: { status: "Paralisado" },
      });
      await tx.client.update({
        where: { id: clientId },
        data: { status: "Processo de Inativação", competence_output: competenceDate },
        select: { id: true },
      });
      return tx.clientTermination.create({
        data: {
          client_id: clientId,
          reason: input.reason,
          description: input.description,
          competence,
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
  }

  async updateFinance(
    clientId: string,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return (this.prisma as any).client.update({
      where: { id: clientId },
      data: { contract: input.contract },
      select: { id: true, contract: true },
    });
  }

  async updateRegularize(
    clientId: string,
    organizationId: string,
    _userId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    const data = { ...input };
    if (data.cpf_cnpj !== undefined) data.cpf_cnpj = cleanDocument(String(data.cpf_cnpj));
    if (data.cpf_responsible !== undefined)
      data.cpf_responsible = cleanDocument(String(data.cpf_responsible));
    return (this.prisma as any).client.update({
      where: { id: clientId },
      data,
      select: {
        id: true,
        dominio_code: true,
        name: true,
        company_name: true,
        fantasy_name: true,
        cpf_cnpj: true,
        cnae_secondary: true,
        cnae: true,
        responsible: true,
        cpf_responsible: true,
        address: true,
        cep: true,
        neighborhood: true,
        state: true,
        city: true,
        customer_since: true,
        municipal_registration: true,
        state_registration: true,
        commercial_board_registration: true,
        status: true,
        competence_entry: true,
        competence_output: true,
        opening_date: true,
        regime: true,
        size: true,
        segment: true,
        contabil: true,
        fiscal: true,
        pessoal: true,
        infoproduto: true,
        consultoria: true,
        start_strike: true,
        end_strike: true,
        deletion_date: true,
      },
    });
  }

  async runCompetenceOutputUpdate(): Promise<unknown> {
    const clients = await (this.prisma as any).client.findMany({
      where: { competence_output: { lte: new Date() }, status: "Processo de Inativação" },
      select: { id: true },
    });
    if (clients.length === 0) return { updated: 0 };
    await (this.prisma as any).client.updateMany({
      where: { id: { in: clients.map((client: { id: string }) => client.id) } },
      data: { status: "Inativo" },
    });
    return { updated: clients.length };
  }

  async applyCommercialProjection(event: Record<string, unknown>): Promise<unknown> {
    try {
      return await (this.prisma as any).$transaction(async (tx: any) => {
        const previous = await tx.clientCommercialProjectionEvent.findUnique({
          where: { id: event.event_id },
          select: { organization_id: true, client_id: true },
        });
        if (previous) {
          if (
            previous.organization_id !== event.organization_id ||
            previous.client_id !== event.client_id
          ) {
            throw new ServiceError(409, "Evento comercial pertence a outro tenant.");
          }
          const client = await tx.client.findFirst({
            where: { id: event.client_id, organization_id: event.organization_id },
            select: {
              id: true,
              name: true,
              company_name: true,
              fantasy_name: true,
              service_unique: true,
              type_registration: true,
            },
          });
          if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");
          return {
            event_id: event.event_id,
            applied: false,
            duplicate: true,
            client_id: event.client_id,
            client,
          };
        }
        const client = await tx.client.findFirst({
          where: { id: event.client_id, organization_id: event.organization_id },
          select: {
            id: true,
            name: true,
            company_name: true,
            fantasy_name: true,
            service_unique: true,
            type_registration: true,
          },
        });
        if (!client) throw new ServiceError(404, "Cliente não encontrado nesta organização.");
        const status =
          event.to_status === "Fechado"
            ? "Ativo"
            : event.to_status === "Recusado pelo Cliente"
              ? "Não Contratado"
              : event.to_status === "Paralisado"
                ? "Paralisado"
                : "Prospecção";
        const updated = await tx.client.updateMany({
          where: { id: event.client_id, organization_id: event.organization_id },
          data: {
            status,
            prospecting_status: event.to_status,
            date_status: event.status_date ? new Date(String(event.status_date)) : null,
            description_prospecting: event.description,
          },
        });
        if (updated.count !== 1)
          throw new ServiceError(404, "Cliente não encontrado nesta organização.");
        await tx.clientCommercialProjectionEvent.create({
          data: {
            id: event.event_id,
            organization_id: event.organization_id,
            client_id: event.client_id,
            event_type: event.event_type,
            audit_correlation_id: event.audit_correlation_id,
          },
        });
        return {
          event_id: event.event_id,
          applied: true,
          duplicate: false,
          client_id: event.client_id,
          client,
        };
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ServiceError(409, "Evento comercial já está sendo processado.", error);
      }
      throw error;
    }
  }

  async reportingCatalog(): Promise<unknown> {
    return clientIntegrationReportingCatalog;
  }

  async extractReporting(input: {
    organizationId: string;
    source: string;
    fields: readonly string[];
    limit: number;
    query?: unknown;
    offset?: number;
  }): Promise<unknown> {
    if (input.query && !this.inReportingSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new ClientService(
          transaction as PrismaClient,
          this.cnpjLookupApiUrl,
          this.cnpjLookupApiToken,
          this.historyStorage,
          true,
        ).extractReporting(input),
      );
    }
    const load = async (fields: readonly string[], limit: number, offset = 0) => {
      const allowedFields = getClientIntegrationReportingFields(
        input.source as "integracao.clients",
      );
      if (fields.some((field) => !allowedFields.includes(field))) {
        throw new ServiceError(403, "Campo não publicado para relatórios.");
      }
      const select = Object.fromEntries(
        fields.map((field) => [field === "client_id" ? "id" : field, true]),
      );
      const rows = await (this.prisma as any).client.findMany({
        where: { organization_id: input.organizationId },
        select,
        skip: offset,
        orderBy: { id: "asc" },
        take: limit + 1,
      });
      return {
        rows: rows
          .slice(0, limit)
          .map((row: Record<string, unknown>) =>
            Object.fromEntries(
              fields.map((field) => [field, field === "client_id" ? row.id : row[field]]),
            ),
          ),
        reachedLimit: rows.length > limit,
      };
    };
    if (input.query) {
      return executeReportingQuery(
        {
          source: input.source,
          fields: input.fields,
          limit: input.limit,
          query: input.query as never,
        },
        load,
      );
    }
    return load(input.fields, input.limit, input.offset);
  }
}
