import {
  clientIntegrationReportingCatalog,
  executeReportingQuery,
  getClientIntegrationReportingFields,
  isValidCpfCnpj,
  normalizeCpfCnpj,
  ServiceError,
  TAX_REGIME_OPTIONS,
  withReportingSnapshot,
} from "@workspace/shared";
import type { ClientSegmentType } from "@workspace/shared/regularize";
import { ACTIVE_CLIENT_STATUS } from "../../../services/client-service/src/schemas/client.schemas.js";
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

export type ClientAuditEvent = {
  organizationId: string;
  userId: string;
  permission: number | null;
  action: "create" | "update";
  referring: "clients" | "clients.regimes" | "clients.segments" | "clients.group";
  referringId: string;
  changes: Record<string, { from: unknown; to: unknown }>;
};

export type ClientAuditSink = (event: ClientAuditEvent) => Promise<void>;

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
  listRegimes: (organizationId: string, authorization: ClientAuthorization) => Promise<unknown>;
  createRegime: (
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  updateRegime: (
    id: string,
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listSegments: (organizationId: string, authorization: ClientAuthorization) => Promise<unknown>;
  createSegment: (
    organizationId: string,
    input: { name: string; type: ClientSegmentType },
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  updateSegment: (
    id: string,
    organizationId: string,
    input: CatalogItemInput,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listGroups: (organizationId: string, authorization: ClientAuthorization) => Promise<unknown>;
  createGroup: (
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  updateGroup: (
    id: string,
    organizationId: string,
    input: { name?: string; status?: boolean },
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  replaceGroupClients: (
    id: string,
    organizationId: string,
    clientIds: readonly string[],
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listLicitacaoHistory: (
    clientId: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ) => Promise<unknown>;
  listLicitacaoBidders: (
    organizationId: string,
    authorization: ClientAuthorization,
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

type WorkerModelName =
  | "organization"
  | "client"
  | "task"
  | "clientTermination"
  | "clientHistory"
  | "clientHistoryPending"
  | "pA"
  | "clientCommercialProjectionEvent"
  | "clientRegime"
  | "clientSegment"
  | "clientLicitacaoHistory"
  | "user";

type WorkerModelDelegate = {
  findUnique: (args: unknown) => Promise<ClientRow | null>;
  findFirst: (args: unknown) => Promise<ClientRow | null>;
  findMany: (args: unknown) => Promise<ClientRow[]>;
  create: (args: unknown) => Promise<ClientRow>;
  update: (args: unknown) => Promise<ClientRow>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
  count: (args: unknown) => Promise<number>;
};

type WorkerTransactionClient = Record<WorkerModelName, WorkerModelDelegate>;

type WorkerPrismaClient = Omit<PrismaClient, WorkerModelName | "$transaction"> & {
  [K in WorkerModelName]: WorkerModelDelegate;
} & {
  $transaction: <T>(callback: (tx: WorkerTransactionClient) => Promise<T>) => Promise<T>;
};

const organizationSelect = {
  id: true,
  name: true,
  slug: true,
  logo_url: true,
  status: true,
  subscription_plan: true,
} as const;

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
  coringa_status: true,
  tecnologia: true,
  licitacao: true,
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

const regularizeSelect = {
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
  coringa_status: true,
  tecnologia: true,
  licitacao: true,
  contabil: true,
  fiscal: true,
  pessoal: true,
  infoproduto: true,
  consultoria: true,
  start_strike: true,
  end_strike: true,
  deletion_date: true,
} as const;

const LICITACAO_BIDDER_STATUSES = ["Ativo", "Processo de Inativação"] as const;

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

function cleanDocument(value: string | null | undefined): string {
  return value?.replace(/\D/g, "") ?? "";
}

function clientDocumentType(type: unknown): "PF" | "PJ" {
  return type === "PF" ? "PF" : "PJ";
}

function assertValidClientDocument(value: unknown, type: unknown): string {
  const normalized = normalizeCpfCnpj(typeof value === "string" ? value : "");
  const personType = clientDocumentType(type);

  if (!isValidCpfCnpj(normalized, personType)) {
    throw new ServiceError(400, `${personType === "PF" ? "CPF" : "CNPJ"} inválido.`);
  }

  return normalized;
}

function isClientDocumentUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

type CatalogKind = "regime" | "segment";

/**
 * Catálogos da ficha por organização (#1740, #1741). O cliente guarda o nome: renomear não
 * reescreve fichas, e um valor gravado fora do catálogo continua aceito como está.
 */
const CATALOGS = {
  regime: {
    model: "clientRegime",
    field: "regime",
    referring: "clients.regimes",
    label: "Regime",
    shared: TAX_REGIME_OPTIONS as readonly string[],
    select: { id: true, name: true, created_at: true, updated_at: true },
  },
  segment: {
    model: "clientSegment",
    field: "segment",
    referring: "clients.segments",
    label: "Segmento",
    shared: [] as readonly string[],
    select: { id: true, name: true, type: true, created_at: true, updated_at: true },
  },
} as const;

type CatalogItemInput = { name?: string; type?: ClientSegmentType };

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): Record<string, { from: unknown; to: unknown }> {
  return Object.fromEntries(
    keys
      .filter((key) => after[key] !== undefined && after[key] !== before[key])
      .map((key) => [key, { from: before[key], to: after[key] }]),
  );
}

function catalogDisplayName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeCatalogName(name: string): string {
  return catalogDisplayName(name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

// Grupos canônicos são da Integração e também são geridos pelo Regularize (#1742).
// Mesma regra de clientGroupsReadPolicy/EditPolicy em services/gateway/src/security/policies.ts.
const GROUP_MODULES = ["integracao", "regularize"] as const;

function requireGroupPermission(auth: ClientAuthorization, minimum: number): void {
  if (auth.isOwner) return;
  if (!GROUP_MODULES.some((module) => (auth.modules?.[module] ?? 0) >= minimum)) {
    throw new ServiceError(403, "Usuário não possui permissão para grupos de empresas.");
  }
}

function groupSelect(organizationId: string) {
  return {
    id: true,
    name: true,
    status: true,
    organization_id: true,
    clients: {
      where: {
        organization_id: organizationId,
        client: { is: { organization_id: organizationId } },
      },
      select: {
        client: {
          select: { id: true, name: true, company_name: true, fantasy_name: true, cpf_cnpj: true },
        },
      },
    },
  } as const;
}

type GroupRow = { clients: Array<{ client: { id: string } & Record<string, unknown> }> } & Record<
  string,
  unknown
>;

function presentGroup(group: GroupRow) {
  return { ...group, clients: group.clients.map(({ client }) => client) };
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
  private readonly prisma: PrismaClient;
  private readonly db: WorkerPrismaClient;

  constructor(
    prisma: PrismaClient,
    private readonly cnpjLookupApiUrl?: string,
    private readonly cnpjLookupApiToken?: string,
    private readonly historyStorage?: WorkerHistoryStorageLike,
    private readonly inReportingSnapshot = false,
    private readonly audit?: ClientAuditSink,
  ) {
    this.prisma = prisma;
    this.db = prisma as unknown as WorkerPrismaClient;
  }

  private async organization(organizationId: string): Promise<ClientRow> {
    const row = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: organizationSelect,
    });
    if (!row) throw new ServiceError(404, "Organização não encontrada.");
    return row;
  }

  private catalog(kind: CatalogKind) {
    const config = CATALOGS[kind];
    return { config, delegate: this.db[config.model] };
  }

  /** Valor aceito na ficha: compartilhado, do catálogo da organização ou o já gravado. */
  private async resolveCatalogValue(
    kind: CatalogKind,
    organizationId: string,
    value: unknown,
    current: unknown,
  ): Promise<string | null | undefined> {
    if (value === undefined) return undefined;
    const name = typeof value === "string" ? catalogDisplayName(value) : "";
    if (!name) return null;
    const normalized = normalizeCatalogName(name);
    // Mesmo valor gravado (até em caixa ou espaços diferentes) volta como está.
    if (typeof current === "string" && normalizeCatalogName(current) === normalized) return current;
    const { config, delegate } = this.catalog(kind);
    const shared = config.shared.find((option) => normalizeCatalogName(option) === normalized);
    if (shared) return shared;
    const row = await delegate.findFirst({
      where: { organization_id: organizationId, normalized_name: normalized },
      select: { name: true },
    });
    if (!row) throw new ServiceError(400, `${config.label} não cadastrado na organização.`);
    return String(row.name);
  }

  /** Resolve regime e segmento do input e devolve o de/para a auditar depois da gravação. */
  private async resolveCatalogFields(
    organizationId: string,
    data: Record<string, unknown>,
    existing: ClientRow | undefined,
  ): Promise<Record<string, { from: unknown; to: unknown }>> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const kind of ["regime", "segment"] as const) {
      const field = CATALOGS[kind].field;
      const current = existing?.[field];
      const value = await this.resolveCatalogValue(kind, organizationId, data[field], current);
      if (value === undefined) continue;
      data[field] = value;
      if (existing && (current ?? null) !== value)
        changes[field] = { from: current ?? null, to: value };
    }
    return changes;
  }

  private async auditClientChanges(
    clientId: string,
    organizationId: string,
    authorization: Pick<ClientAuthorization, "userId" | "permission">,
    changes: Record<string, { from: unknown; to: unknown }>,
  ): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.audit?.({
      organizationId,
      userId: authorization.userId,
      permission: authorization.permission ?? null,
      action: "update",
      referring: "clients",
      referringId: clientId,
      changes,
    });
  }

  private async listCatalog(
    kind: CatalogKind,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireClientListPermission(authorization);
    const { config, delegate } = this.catalog(kind);
    return delegate.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: "asc" },
      select: config.select,
    });
  }

  private async assertCatalogNameFree(
    kind: CatalogKind,
    organizationId: string,
    normalized: string,
    exceptId?: string,
  ): Promise<void> {
    const { config, delegate } = this.catalog(kind);
    const duplicate = await delegate.findFirst({
      where: {
        organization_id: organizationId,
        normalized_name: normalized,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw new ServiceError(409, `${config.label} já cadastrado.`);
  }

  private async writeCatalogItem(
    kind: CatalogKind,
    write: () => Promise<ClientRow>,
  ): Promise<ClientRow> {
    try {
      return await write();
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error))
        throw new ServiceError(409, `${CATALOGS[kind].label} já cadastrado.`, error);
      throw error;
    }
  }

  private async createCatalogItem(
    kind: CatalogKind,
    organizationId: string,
    input: CatalogItemInput,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const { config, delegate } = this.catalog(kind);
    const name = catalogDisplayName(input.name ?? "");
    const normalized = normalizeCatalogName(name);
    await this.assertCatalogNameFree(kind, organizationId, normalized);
    const fields = { name, ...(input.type !== undefined ? { type: input.type } : {}) };
    const row = await this.writeCatalogItem(kind, () =>
      delegate.create({
        data: { organization_id: organizationId, ...fields, normalized_name: normalized },
        select: config.select,
      }),
    );
    await this.audit?.({
      organizationId,
      userId: authorization.userId,
      permission: authorization.permission ?? null,
      action: "create",
      referring: config.referring,
      referringId: String(row.id),
      changes: Object.fromEntries(
        Object.entries(fields).map(([key, to]) => [key, { from: null, to }]),
      ),
    });
    return row;
  }

  private async updateCatalogItem(
    kind: CatalogKind,
    id: string,
    organizationId: string,
    input: CatalogItemInput,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const { config, delegate } = this.catalog(kind);
    const existing = await delegate.findFirst({
      where: { id, organization_id: organizationId },
      select: config.select,
    });
    if (!existing) throw new ServiceError(404, `${config.label} não encontrado.`);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      data.name = catalogDisplayName(input.name);
      data.normalized_name = normalizeCatalogName(input.name);
      await this.assertCatalogNameFree(kind, organizationId, String(data.normalized_name), id);
    }
    if (input.type !== undefined) data.type = input.type;
    // Clientes guardam o nome: renomear o catálogo não reescreve fichas já gravadas.
    const row = await this.writeCatalogItem(kind, () =>
      delegate.update({ where: { id }, data, select: config.select }),
    );
    const changes = changedFields(existing, data, ["name", "type"]);
    if (Object.keys(changes).length > 0) {
      await this.audit?.({
        organizationId,
        userId: authorization.userId,
        permission: authorization.permission ?? null,
        action: "update",
        referring: config.referring,
        referringId: id,
        changes,
      });
    }
    return row;
  }

  listRegimes(organizationId: string, authorization: ClientAuthorization): Promise<unknown> {
    return this.listCatalog("regime", organizationId, authorization);
  }

  createRegime(
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.createCatalogItem("regime", organizationId, { name }, authorization);
  }

  updateRegime(
    id: string,
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.updateCatalogItem("regime", id, organizationId, { name }, authorization);
  }

  listSegments(organizationId: string, authorization: ClientAuthorization): Promise<unknown> {
    return this.listCatalog("segment", organizationId, authorization);
  }

  createSegment(
    organizationId: string,
    input: { name: string; type: ClientSegmentType },
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.createCatalogItem("segment", organizationId, input, authorization);
  }

  updateSegment(
    id: string,
    organizationId: string,
    input: CatalogItemInput,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    return this.updateCatalogItem("segment", id, organizationId, input, authorization);
  }

  private async auditGroup(
    organizationId: string,
    authorization: ClientAuthorization,
    action: "create" | "update",
    groupId: string,
    changes: Record<string, { from: unknown; to: unknown }>,
  ): Promise<void> {
    if (Object.keys(changes).length === 0) return;
    await this.audit?.({
      organizationId,
      userId: authorization.userId,
      permission: authorization.permission ?? null,
      action,
      referring: "clients.group",
      referringId: groupId,
      changes,
    });
  }

  private async assertGroupNameFree(
    organizationId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.group.findFirst({
      where: {
        organization_id: organizationId,
        name,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw new ServiceError(409, "Já existe um grupo com este nome.");
  }

  async listGroups(organizationId: string, authorization: ClientAuthorization): Promise<unknown> {
    requireGroupPermission(authorization, 1);
    const groups = await this.prisma.group.findMany({
      where: { organization_id: organizationId },
      orderBy: { name: "asc" },
      select: groupSelect(organizationId),
    });
    return groups.map(presentGroup);
  }

  async createGroup(
    organizationId: string,
    name: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireGroupPermission(authorization, 2);
    const trimmed = catalogDisplayName(name);
    await this.assertGroupNameFree(organizationId, trimmed);
    const group = await this.prisma.group.create({
      data: { name: trimmed, organization_id: organizationId },
      select: groupSelect(organizationId),
    });
    await this.auditGroup(organizationId, authorization, "create", group.id, {
      name: { from: null, to: trimmed },
      status: { from: null, to: group.status },
    });
    return presentGroup(group);
  }

  async updateGroup(
    id: string,
    organizationId: string,
    input: { name?: string; status?: boolean },
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireGroupPermission(authorization, 2);
    const existing = await this.prisma.group.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!existing) throw new ServiceError(404, "Grupo não encontrado.");
    const data: { name?: string; status?: boolean } = {};
    if (input.name !== undefined) {
      data.name = catalogDisplayName(input.name);
      await this.assertGroupNameFree(organizationId, data.name, id);
    }
    if (input.status !== undefined) data.status = input.status;
    const group = await this.prisma.group.update({
      where: { id },
      data,
      select: groupSelect(organizationId),
    });
    await this.auditGroup(
      organizationId,
      authorization,
      "update",
      id,
      changedFields(existing, data, ["name", "status"]),
    );
    return presentGroup(group);
  }

  async replaceGroupClients(
    id: string,
    organizationId: string,
    clientIds: readonly string[],
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireGroupPermission(authorization, 2);
    const wanted = [...new Set(clientIds)];
    const result = await this.prisma.$transaction(async (transaction) => {
      const group = await transaction.group.findFirst({
        where: { id, organization_id: organizationId },
        select: { id: true },
      });
      if (!group) throw new ServiceError(404, "Grupo não encontrado.");
      const clients = wanted.length
        ? await transaction.client.findMany({
            where: { id: { in: wanted }, organization_id: organizationId },
            select: { id: true },
          })
        : [];
      if (clients.length !== wanted.length) {
        throw new ServiceError(404, "Um ou mais clientes não foram encontrados nesta organização.");
      }
      const before = await transaction.clientsGroup.findMany({
        where: { group_id: id, organization_id: organizationId },
        select: { client_id: true },
      });
      const current = new Set(before.map((row) => row.client_id));
      const removed = [...current].filter((clientId) => !wanted.includes(clientId));
      const added = wanted.filter((clientId) => !current.has(clientId));
      if (removed.length) {
        await transaction.clientsGroup.deleteMany({
          where: { group_id: id, organization_id: organizationId, client_id: { in: removed } },
        });
      }
      if (added.length) {
        // O índice único (group_id, client_id) impede o par repetido mesmo em gravações concorrentes.
        await transaction.clientsGroup.createMany({
          data: added.map((clientId) => ({
            group_id: id,
            client_id: clientId,
            organization_id: organizationId,
          })),
          skipDuplicates: true,
        });
      }
      return { clients, added, removed };
    });
    if (result.added.length || result.removed.length) {
      await this.auditGroup(organizationId, authorization, "update", id, {
        clients: { from: { removed: result.removed }, to: { added: result.added } },
      });
    }
    return { id, clients: result.clients };
  }

  private async client(id: string, organizationId: string): Promise<ClientRow> {
    const row = await this.db.client.findFirst({
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
      const documentTerm = /^[0-9./-]+$/u.test(term) ? normalizeCpfCnpj(term) || term : term;
      const search = {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { company_name: { contains: term, mode: "insensitive" } },
          { fantasy_name: { contains: term, mode: "insensitive" } },
          { cpf_cnpj: { contains: documentTerm, mode: "insensitive" } },
        ],
      };
      Object.assign(
        where,
        Object.keys(where).length > 1 ? { AND: [{ ...where }, search] } : search,
      );
    }
    const organization = await this.organization(organizationId);
    const rows = await this.db.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      select: clientListSelect,
    });
    const total = await this.db.client.count({ where });
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
    const row = await this.db.client.findFirst({
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
    const normalizedDocument = assertValidClientDocument(input.cpf_cnpj, input.type);
    const duplicate = await this.db.client.findFirst({
      where: { organization_id: organizationId, cpf_cnpj: normalizedDocument },
      select: { id: true },
    });
    if (duplicate) throw new ServiceError(409, "Cliente já cadastrado.");
    const data: Record<string, unknown> = { ...input };
    await this.resolveCatalogFields(organizationId, data, undefined);
    try {
      const row = await this.db.client.create({
        data: {
          ...data,
          organization_id: organizationId,
          cpf_cnpj: normalizedDocument,
        },
        select: clientSelect,
      });
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
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const existing = await this.client(id, organizationId);
    const data: Record<string, unknown> = { ...input };
    if (data.cpf_cnpj !== undefined || data.type !== undefined) {
      const normalizedDocument = assertValidClientDocument(
        data.cpf_cnpj ?? existing.cpf_cnpj,
        data.type ?? existing.type,
      );
      const duplicate = await this.db.client.findFirst({
        where: { organization_id: organizationId, cpf_cnpj: normalizedDocument, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Cliente já cadastrado.");
      data.cpf_cnpj = normalizedDocument;
    }
    const changes = await this.resolveCatalogFields(organizationId, data, existing);
    try {
      const row = await this.db.client.update({
        where: { id },
        data,
        select: clientSelect,
      });
      await this.auditClientChanges(id, organizationId, authorization, changes);
      return toPublic(row, await this.organization(organizationId));
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
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 3);
    const existing = await this.client(id, organizationId);
    if (existing.status === "Inativo") throw new ServiceError(409, "Cliente já está inativo.");
    const row = await this.db.client.update({
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
    const row = await this.db.client.update({
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
    const cpfCnpj = assertValidClientDocument(input.cpf_cnpj, input.type);
    const exists = await this.db.client.findFirst({
      where: { cpf_cnpj: cpfCnpj, organization_id: organizationId },
      select: { id: true },
    });
    if (exists) throw new ServiceError(409, "Cliente já cadastrado.");
    try {
      return await this.db.client.create({
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
          prospecting_status:
            input.type_registration === "Novo" ? "Análise/Agendamento" : "Fechado",
        },
        select: { id: true, name: true, cpf_cnpj: true },
      });
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error)) {
        throw new ServiceError(409, "Cliente já cadastrado.", error);
      }
      throw error;
    }
  }

  async updateIntegration(
    id: string,
    organizationId: string,
    input: Record<string, unknown>,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requirePermission(authorization, 2);
    const existing = await this.client(id, organizationId);
    const data: Record<string, unknown> = { ...input };
    if (data.cpf_cnpj !== undefined || data.type !== undefined) {
      const normalizedDocument = assertValidClientDocument(
        data.cpf_cnpj ?? existing.cpf_cnpj,
        data.type ?? existing.type,
      );
      const duplicate = await this.db.client.findFirst({
        where: { organization_id: organizationId, cpf_cnpj: normalizedDocument, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Cliente já cadastrado.");
      data.cpf_cnpj = normalizedDocument;
    }
    if (data.cpf_responsible !== undefined)
      data.cpf_responsible = cleanDocument(String(data.cpf_responsible));
    if (data.cpf_agent !== undefined) data.cpf_agent = cleanDocument(String(data.cpf_agent));
    try {
      const row = await this.db.client.update({
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
      // O schema de integração só aceita os regimes compartilhados; a troca também é auditada.
      if (data.regime !== undefined && (existing.regime ?? null) !== (data.regime ?? null)) {
        await this.auditClientChanges(id, organizationId, authorization, {
          regime: { from: existing.regime ?? null, to: data.regime ?? null },
        });
      }
      return row;
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error)) {
        throw new ServiceError(409, "Cliente já cadastrado.", error);
      }
      throw error;
    }
  }

  private async ensureClient(id: string, organizationId: string): Promise<void> {
    await this.client(id, organizationId);
  }

  async listHistories(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return {
      list: await this.db.clientHistory.findMany({
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
    const row = await this.db.clientHistory.create({
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
      await this.db.clientHistoryPending.deleteMany({
        where: { id: input.pending_id, client_id: clientId, organization_id: organizationId },
      });
    }
    return row;
  }

  async getHistory(clientId: string, historyId: string, organizationId: string): Promise<unknown> {
    const row = await this.db.clientHistory.findFirst({
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
    const existing = await this.db.clientHistory.findFirst({
      where: { id: historyId, organization_id: organizationId },
      select: { id: true, user_id: true },
    });
    if (!existing) throw new ServiceError(404, "Histórico não encontrado.");
    if (existing.user_id !== userId)
      throw new ServiceError(403, "Usuário não tem permissão para editar este histórico.");
    return this.db.clientHistory.update({
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
    return this.db.clientHistoryPending.create({
      data: { client_id: clientId, organization_id: organizationId, user_id: userId, reason },
      select: { id: true, user_id: true, client_id: true, reason: true },
    });
  }

  async listPending(organizationId: string, userId?: string): Promise<unknown> {
    return {
      list: await this.db.clientHistoryPending.findMany({
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
    const existing = await this.db.clientHistory.findFirst({
      where: { id: historyId, client_id: clientId, organization_id: organizationId },
      select: { id: true, user_id: true, file: true },
    });
    if (!existing) throw new ServiceError(404, "Histórico não encontrado.");
    if (!canManage && existing.user_id !== userId)
      throw new ServiceError(403, "Usuário não tem permissão para excluir este histórico.");
    await this.db.clientHistory.delete({ where: { id: historyId } });
    if (existing.file && !/^https?:\/\//iu.test(String(existing.file))) {
      await this.historyStorage?.remove(String(existing.file)).catch(() => undefined);
    }
  }

  async deletePending(pendingId: string, organizationId: string): Promise<void> {
    const exists = await this.db.clientHistoryPending.findFirst({
      where: { id: pendingId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) throw new ServiceError(404, "Pendência não encontrada.");
    await this.db.clientHistoryPending.delete({ where: { id: pendingId } });
  }

  async createPA(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    const exists = await this.db.pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: { client_id: true },
    });
    if (exists) throw new ServiceError(409, "PA já cadastrado para este cliente.");
    return this.db.pA.create({
      data: { client_id: clientId, organization_id: organizationId },
      select: paSelect,
    });
  }

  async getPADetail(clientId: string, organizationId: string): Promise<unknown> {
    await this.ensureClient(clientId, organizationId);
    return this.db.pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: paDetailSelect,
    });
  }

  async updatePA(
    clientId: string,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const exists = await this.db.pA.findFirst({
      where: { client_id: clientId, organization_id: organizationId },
      select: { client_id: true },
    });
    if (!exists) throw new ServiceError(404, "PA não encontrado.");
    if (Object.keys(input).length === 0)
      throw new ServiceError(400, "Informe ao menos um campo para atualizar.");
    return this.db.pA.update({
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
    if (client.status !== ACTIVE_CLIENT_STATUS)
      throw new ServiceError(409, "Só é possível inativar cliente ativo.");
    const competence = String(input.competence_output);
    const [year, month] = competence.split("-").map(Number);
    const competenceDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return this.db.$transaction(async (tx) => {
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
    return this.db.client.update({
      where: { id: clientId },
      data: { contract: input.contract },
      select: { id: true, contract: true },
    });
  }

  async updateRegularize(
    clientId: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const existing = await this.client(clientId, organizationId);
    const data = { ...input };
    const changes = await this.resolveCatalogFields(organizationId, data, existing);
    if (data.cpf_cnpj !== undefined) {
      const normalizedDocument = assertValidClientDocument(data.cpf_cnpj, existing.type);
      const duplicate = await this.db.client.findFirst({
        where: {
          organization_id: organizationId,
          cpf_cnpj: normalizedDocument,
          id: { not: clientId },
        },
        select: { id: true },
      });
      if (duplicate) throw new ServiceError(409, "Cliente já cadastrado.");
      data.cpf_cnpj = normalizedDocument;
    }
    if (data.cpf_responsible !== undefined)
      data.cpf_responsible = cleanDocument(String(data.cpf_responsible));
    // Não informado (null), Sim e Não são valores distintos; toda troca entra no histórico.
    const previousLicitacao = existing.licitacao ?? null;
    const nextLicitacao = data.licitacao === undefined ? undefined : (data.licitacao ?? null);
    const licitacaoChanged = nextLicitacao !== undefined && nextLicitacao !== previousLicitacao;
    if (licitacaoChanged) changes.licitacao = { from: previousLicitacao, to: nextLicitacao };
    try {
      const row = await this.db.$transaction(async (transaction) => {
        const updated = await transaction.client.update({
          where: { id: clientId },
          data,
          select: regularizeSelect,
        });
        if (licitacaoChanged) {
          await transaction.clientLicitacaoHistory.create({
            data: {
              organization_id: organizationId,
              client_id: clientId,
              previous_value: previousLicitacao,
              new_value: nextLicitacao,
              actor_user_id: userId,
            },
          });
        }
        return updated;
      });
      await this.auditClientChanges(clientId, organizationId, { userId }, changes);
      return row;
    } catch (error) {
      if (isClientDocumentUniqueConstraintError(error)) {
        throw new ServiceError(409, "Cliente já cadastrado.", error);
      }
      throw error;
    }
  }

  async listLicitacaoHistory(
    clientId: string,
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireClientListPermission(authorization);
    await this.ensureClient(clientId, organizationId);
    const rows = await this.db.clientLicitacaoHistory.findMany({
      where: { organization_id: organizationId, client_id: clientId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        previous_value: true,
        new_value: true,
        actor_user_id: true,
        created_at: true,
      },
    });
    const actorIds = [...new Set(rows.map((row) => String(row.actor_user_id)))];
    const actors = actorIds.length
      ? await this.db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const actorName = new Map(actors.map((actor) => [String(actor.id), actor.name]));
    return rows.map((row) => ({
      id: row.id,
      previous_value: row.previous_value ?? null,
      new_value: row.new_value ?? null,
      created_at: serialize(row.created_at),
      actor: { id: row.actor_user_id, name: actorName.get(String(row.actor_user_id)) ?? null },
    }));
  }

  // Lista de licitantes do legado: só "Sim" entre ativos ou em inativação da organização.
  async listLicitacaoBidders(
    organizationId: string,
    authorization: ClientAuthorization,
  ): Promise<unknown> {
    requireClientListPermission(authorization);
    return this.db.client.findMany({
      where: {
        organization_id: organizationId,
        licitacao: true,
        status: { in: [...LICITACAO_BIDDER_STATUSES] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, company_name: true, cpf_cnpj: true, status: true },
    });
  }

  async runCompetenceOutputUpdate(): Promise<unknown> {
    const clients = await this.db.client.findMany({
      where: { competence_output: { lte: new Date() }, status: "Processo de Inativação" },
      select: { id: true },
    });
    if (clients.length === 0) return { updated: 0 };
    await this.db.client.updateMany({
      where: { id: { in: clients.map((client) => String(client.id)) } },
      data: { status: "Inativo" },
    });
    return { updated: clients.length };
  }

  async applyCommercialProjection(event: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.db.$transaction(async (tx) => {
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
      const rows = await this.db.client.findMany({
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
