import {
  collectReportingRows,
  executeReportingQuery,
  REPORTING_QUERY_PAGE_SIZE as REPORTING_DB_PAGE_SIZE,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import { canonicalProcessStatus, OPERATIONAL_PROCESS_FILTER } from "../schemas/status.schemas.js";
import {
  getRegularizeLicenseReportingFields,
  type RegularizeLicenseReportingSource,
} from "./regularizeLicenseReportingCatalog.js";
import {
  getRegularizeMunicipalTaxesReportingFields,
  type RegularizeMunicipalTaxesReportingSource,
} from "./regularizeMunicipalTaxesReportingCatalog.js";
import {
  getRegularizePortfolioReportingFields,
  REGULARIZE_CLIENT_GROUPS_REPORTING_SOURCE,
  REGULARIZE_CLIENTS_PF_REPORTING_SOURCE,
  REGULARIZE_PARTNERS_REPORTING_SOURCE,
  REGULARIZE_PORTFOLIO_LEGACY_STATUS,
  type RegularizePortfolioReportingSource,
} from "./regularizePortfolioReportingCatalog.js";
import {
  getRegularizeProcessReportingFields,
  type RegularizeProcessReportingSource,
} from "./regularizeProcessReportingCatalog.js";

type RegularizePrimaryReportingSource =
  | RegularizeLicenseReportingSource
  | RegularizeProcessReportingSource;

// Filtro opcional da fonte de processos (placeholders de orientação legada, #1377).
type ReportingFilter = Partial<typeof OPERATIONAL_PROCESS_FILTER>;

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string } & ReportingFilter;
    select: Record<string, unknown>;
    take: number;
    cursor?: { id: string };
    skip?: number;
    orderBy: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type ReportingPage = {
  rows: readonly Record<string, unknown>[];
  reachedLimit: boolean;
  nextCursor?: string;
};

async function loadReportingPage(
  delegate: ReportingDelegate,
  organizationId: string,
  fields: readonly string[],
  limit: number,
  cursor?: string,
  filter: ReportingFilter = {},
): Promise<ReportingPage> {
  const rows = await delegate.findMany({
    where: { organization_id: organizationId, ...filter },
    select: Object.fromEntries(["id", ...fields].map((field) => [field, true])),
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: "asc" },
    take: limit + 1,
  });
  const pageRows = rows.slice(0, limit);
  const lastId = pageRows[pageRows.length - 1]?.id;
  const reachedLimit = rows.length > limit;
  return {
    rows: projectRows(pageRows, fields),
    reachedLimit,
    ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
  };
}

// Relações saem com organization_id para descartar vínculo de outra organização.
const PROCESS_RELATED = { select: { name: true, organization_id: true } };
const PROCESS_RESPONSIBLES = ["responsible1", "responsible2", "responsible3"] as const;

// Campos de processo montados na extração e o que cada um precisa ler; os demais são colunas.
const PROCESS_DERIVED_FIELDS: Readonly<Record<string, Record<string, unknown>>> = {
  client_name: {
    clientPJ: { select: { name: true, company_name: true, organization_id: true } },
    clientPF: PROCESS_RELATED,
  },
  responsible1_name: { responsible1: PROCESS_RELATED },
  responsible_names: Object.fromEntries(PROCESS_RESPONSIBLES.map((key) => [key, PROCESS_RELATED])),
  entry_month: { entry_date: true },
  completion_month: { completion_date: true },
  locked: { locking_type: true },
};

function reportingMonth(value: unknown): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 7) : null;
}

function sameOrganization(relation: unknown, organizationId: string): Record<string, unknown> {
  const candidate = (relation ?? {}) as Record<string, unknown>;
  return candidate.organization_id === organizationId ? candidate : {};
}

// O campo é texto livre no cadastro atual. A migração trouxe para ele a data de notificação
// do legado (travamento_cliente_notificacao), que o PHP só gravava em travamento por cliente
// e zerava nos demais casos (regularize/pages/processos/editar.php).
function processLockingType(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? "Cliente" : text;
}

async function loadProcessReportingPage(
  delegate: ReportingDelegate,
  organizationId: string,
  fields: readonly string[],
  limit: number,
  cursor?: string,
): Promise<ReportingPage> {
  const select: Record<string, unknown> = { id: true };
  for (const field of fields) {
    Object.assign(select, PROCESS_DERIVED_FIELDS[field] ?? { [field]: true });
  }
  const found = await delegate.findMany({
    where: { organization_id: organizationId, ...OPERATIONAL_PROCESS_FILTER },
    select,
    ...portfolioPaging(limit, cursor),
  });
  const rows = found.slice(0, limit).map((process) => {
    const company = sameOrganization(process.clientPJ, organizationId);
    const person = sameOrganization(process.clientPF, organizationId);
    const responsibles = PROCESS_RESPONSIBLES.map(
      (key) => sameOrganization(process[key], organizationId).name ?? null,
    );
    const lockingType = processLockingType(process.locking_type);
    const derived: Record<string, unknown> = {
      client_name: company.company_name || company.name || person.name || null,
      responsible1_name: responsibles[0],
      responsible_names: responsibles.filter((name) => name !== null).join(", ") || null,
      entry_month: reportingMonth(process.entry_date),
      completion_month: reportingMonth(process.completion_date),
      locking_type: lockingType,
      locked: lockingType !== null,
      status: canonicalProcessStatus(process.status),
    };
    return Object.fromEntries(
      fields
        .map((field) => [field, field in derived ? derived[field] : process[field]])
        .filter(([, value]) => value !== undefined),
    );
  });
  return portfolioPage(found, limit, rows);
}

// Definições salvas antes da normalização filtram pelo alias; o valor é levado ao canônico.
function canonicalProcessQuery(query: ReportingQuery): ReportingQuery {
  return {
    ...query,
    filters: query.filters?.map((filter) =>
      filter.field === "status"
        ? {
            ...filter,
            value: Array.isArray(filter.value)
              ? filter.value.map(canonicalProcessStatus)
              : canonicalProcessStatus(filter.value),
          }
        : filter,
    ),
  };
}

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [field, row[field]]).filter(([, value]) => value !== undefined),
    ),
  );
}

export class RegularizeLicenseReportingService {
  constructor(
    private readonly prisma: {
      license: ReportingDelegate;
      process?: ReportingDelegate;
    },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: RegularizePrimaryReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeLicenseReportingService(transaction, true).extract(input),
      );
    }
    const allowedFields =
      input.source === "regularize.licenses"
        ? getRegularizeLicenseReportingFields(input.source)
        : getRegularizeProcessReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate =
      input.source === "regularize.licenses" ? this.prisma.license : this.prisma.process;
    if (!delegate) {
      throw new ServiceError(500, "Fonte interna de relatórios não configurada.");
    }

    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      input.source === "regularize.licenses"
        ? loadReportingPage(delegate, input.organizationId, fields, limit, cursor)
        : loadProcessReportingPage(delegate, input.organizationId, fields, limit, cursor);
    if (input.query) {
      const query =
        input.source === "regularize.licenses" ? input.query : canonicalProcessQuery(input.query);
      return executeReportingQuery(
        { ...input, query },
        { loadPage: (fields, limit, cursor) => loadPage(fields, limit, cursor) },
      );
    }

    const result = await collectReportingRows(
      (limit, cursor) => loadPage(input.fields, limit, cursor),
      input.limit + 1,
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }
}

export class RegularizeMunicipalTaxesReportingService {
  constructor(
    private readonly prisma: { municipalTaxes: ReportingDelegate },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: RegularizeMunicipalTaxesReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizeMunicipalTaxesReportingService(transaction, true).extract(input),
      );
    }
    const allowedFields = getRegularizeMunicipalTaxesReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      loadReportingPage(this.prisma.municipalTaxes, input.organizationId, fields, limit, cursor);
    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        { loadPage: (fields, limit, cursor) => loadPage(fields, limit, cursor) },
      );
    }

    const result = await collectReportingRows(
      (limit, cursor) => loadPage(input.fields, limit, cursor),
      input.limit + 1,
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }
}

type PortfolioDelegate = {
  findMany(input: Record<string, unknown>): Promise<readonly Record<string, unknown>[]>;
};

// Campos calculados na extração; os demais são colunas do cadastro canônico do cliente.
// Departamento não marcado no cadastro é "não": sem isso o filtro "= não" perderia os nulos.
// Licitação fica fora: nulo ali é "não informado", distinto de Sim/Não (#1743).
const PORTFOLIO_DEPARTMENT_FLAGS = new Set([
  "contabil",
  "fiscal",
  "pessoal",
  "consultoria",
  "infoproduto",
  "tecnologia",
  "castelo_med",
]);

const PORTFOLIO_DERIVED_FIELDS = new Set([
  "segment_type",
  "has_passwords",
  "has_partners",
  "group_name",
  "group_active",
]);

const PF_DERIVED_FIELDS = new Set(["birth_month", "has_company", "has_active_company"]);

function portfolioStatus(status: unknown): unknown {
  return Object.keys(REGULARIZE_PORTFOLIO_LEGACY_STATUS).includes(String(status))
    ? REGULARIZE_PORTFOLIO_LEGACY_STATUS[String(status)]
    : status;
}

function portfolioPaging(limit: number, cursor?: string) {
  return {
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: "asc" as const },
    take: limit + 1,
  };
}

function portfolioPage(
  found: readonly Record<string, unknown>[],
  limit: number,
  rows: readonly Record<string, unknown>[],
): ReportingPage {
  const lastId = found[Math.min(found.length, limit) - 1]?.id;
  const reachedLimit = found.length > limit;
  return {
    rows,
    reachedLimit,
    ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
  };
}

export class RegularizePortfolioReportingService {
  constructor(
    private readonly prisma: {
      client: PortfolioDelegate;
      clientPF: PortfolioDelegate;
      clientsGroup: PortfolioDelegate;
      clientSegment: PortfolioDelegate;
      partners: PortfolioDelegate;
      passwordRegularize: PortfolioDelegate;
    },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: RegularizePortfolioReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new RegularizePortfolioReportingService(transaction, true).extract(input),
      );
    }
    const allowedFields = getRegularizePortfolioReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    // Catálogo lido uma vez por extração: a instância é compartilhada entre organizações.
    let segmentTypes: Promise<ReadonlyMap<string, unknown>> | undefined;
    const loadSegmentTypes = () => {
      segmentTypes ??= this.loadSegmentTypes(input.organizationId);
      return segmentTypes;
    };
    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      this.loadPage(input.organizationId, input.source, fields, limit, loadSegmentTypes, cursor);
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, { loadPage });
    }

    const result = await collectReportingRows(
      (limit, cursor) => loadPage(input.fields, limit, cursor),
      input.limit + 1,
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }

  private async loadPage(
    organizationId: string,
    source: RegularizePortfolioReportingSource,
    fields: readonly string[],
    limit: number,
    loadSegmentTypes: () => Promise<ReadonlyMap<string, unknown>>,
    cursor?: string,
  ): Promise<ReportingPage> {
    if (source === REGULARIZE_CLIENTS_PF_REPORTING_SOURCE) {
      return this.loadPfPage(organizationId, fields, limit, cursor);
    }
    if (source === REGULARIZE_PARTNERS_REPORTING_SOURCE) {
      return this.loadPartnerPage(organizationId, fields, limit, cursor);
    }
    const columns = new Set(fields.filter((field) => !PORTFOLIO_DERIVED_FIELDS.has(field)));
    if (fields.includes("segment_type")) columns.add("segment");
    const select = Object.fromEntries(["id", ...columns].map((field) => [field, true]));
    const paging = portfolioPaging(limit, cursor);
    const grouped = source === REGULARIZE_CLIENT_GROUPS_REPORTING_SOURCE;
    const found = grouped
      ? await this.prisma.clientsGroup.findMany({
          where: {
            organization_id: organizationId,
            group: { is: { organization_id: organizationId } },
            client: { is: { organization_id: organizationId } },
          },
          select: {
            id: true,
            group: { select: { name: true, status: true } },
            client: { select },
          },
          ...paging,
        })
      : await this.prisma.client.findMany({
          where: { organization_id: organizationId },
          select,
          ...paging,
        });
    const page = found.slice(0, limit);
    const clients = page.map((row) => (grouped ? row.client : row) as Record<string, unknown>);

    const segmentTypes = fields.includes("segment_type") ? await loadSegmentTypes() : undefined;
    const withPasswords = fields.includes("has_passwords")
      ? new Set(
          (
            await this.prisma.passwordRegularize.findMany({
              where: {
                organization_id: organizationId,
                client_id: { in: clients.map((client) => client.id) },
              },
              select: { client_id: true },
              distinct: ["client_id"],
            })
          ).map((password) => password.client_id),
        )
      : undefined;

    const withPartners = fields.includes("has_partners")
      ? new Set(
          (
            await this.prisma.partners.findMany({
              where: {
                organization_id: organizationId,
                pj_id: { in: clients.map((client) => client.id) },
                exit: null,
                clientPF: { is: { organization_id: organizationId } },
              },
              select: { pj_id: true },
              distinct: ["pj_id"],
            })
          ).map((partner) => partner.pj_id),
        )
      : undefined;

    const rows = page.map((row, index) => {
      const client = clients[index] ?? {};
      const group = (row.group ?? {}) as { name?: unknown; status?: unknown };
      const derived: Record<string, unknown> = {
        group_name: group.name,
        group_active: group.status,
        has_passwords: withPasswords?.has(client.id),
        has_partners: withPartners?.has(client.id),
        segment_type:
          segmentTypes?.get(String(client.segment ?? "").toLocaleLowerCase("pt-BR")) ?? null,
        status: portfolioStatus(client.status),
      };
      return Object.fromEntries(
        fields.map((field) => [
          field,
          field in derived
            ? derived[field]
            : PORTFOLIO_DEPARTMENT_FLAGS.has(field)
              ? client[field] === true
              : client[field],
        ]),
      );
    });
    return portfolioPage(found, limit, rows);
  }

  private async loadPfPage(
    organizationId: string,
    fields: readonly string[],
    limit: number,
    cursor?: string,
  ): Promise<ReportingPage> {
    const columns = new Set(fields.filter((field) => !PF_DERIVED_FIELDS.has(field)));
    if (fields.includes("birth_month")) columns.add("date_of_birth");
    const found = await this.prisma.clientPF.findMany({
      where: { organization_id: organizationId },
      select: Object.fromEntries(["id", ...columns].map((field) => [field, true])),
      ...portfolioPaging(limit, cursor),
    });
    const page = found.slice(0, limit);

    // Vínculos sem saída: é o que o legado chamava de empresa do sócio (saida = 0000-00-00).
    const companies = new Map<unknown, unknown[]>();
    if (fields.includes("has_company") || fields.includes("has_active_company")) {
      const partnerships = await this.prisma.partners.findMany({
        where: {
          organization_id: organizationId,
          pf_id: { in: page.map((pf) => pf.id) },
          exit: null,
          clientPJ: { is: { organization_id: organizationId } },
        },
        select: { pf_id: true, clientPJ: { select: { status: true } } },
      });
      for (const partnership of partnerships) {
        const statuses = companies.get(partnership.pf_id) ?? [];
        statuses.push(portfolioStatus((partnership.clientPJ as { status?: unknown })?.status));
        companies.set(partnership.pf_id, statuses);
      }
    }

    const rows = page.map((pf) => {
      const statuses = companies.get(pf.id) ?? [];
      const derived: Record<string, unknown> = {
        birth_month: pf.date_of_birth instanceof Date ? pf.date_of_birth.getUTCMonth() + 1 : null,
        has_company: statuses.length > 0,
        has_active_company: statuses.includes(REGULARIZE_PORTFOLIO_LEGACY_STATUS.A),
      };
      return Object.fromEntries(
        fields.map((field) => [field, field in derived ? derived[field] : pf[field]]),
      );
    });
    return portfolioPage(found, limit, rows);
  }

  private async loadPartnerPage(
    organizationId: string,
    fields: readonly string[],
    limit: number,
    cursor?: string,
  ): Promise<ReportingPage> {
    const found = await this.prisma.partners.findMany({
      where: {
        organization_id: organizationId,
        clientPF: { is: { organization_id: organizationId } },
        clientPJ: { is: { organization_id: organizationId } },
      },
      select: {
        id: true,
        part: true,
        entry: true,
        exit: true,
        clientPF: { select: { name: true, cpf: true, sex: true } },
        clientPJ: { select: { name: true, company_name: true, cpf_cnpj: true, status: true } },
      },
      ...portfolioPaging(limit, cursor),
    });
    const rows = found.slice(0, limit).map((partnership) => {
      const pf = (partnership.clientPF ?? {}) as Record<string, unknown>;
      const company = (partnership.clientPJ ?? {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {
        partner_name: pf.name,
        partner_cpf: pf.cpf,
        partner_sex: pf.sex,
        company_name: company.company_name ?? company.name,
        company_cpf_cnpj: company.cpf_cnpj,
        company_status: portfolioStatus(company.status),
        entry: partnership.entry,
        exit: partnership.exit ?? null,
        active: partnership.exit == null,
        part: partnership.part,
      };
      return Object.fromEntries(fields.map((field) => [field, row[field]]));
    });
    return portfolioPage(found, limit, rows);
  }

  // O cliente guarda o nome do segmento; o tipo vem do catálogo, sem diferenciar maiúsculas.
  private loadSegmentTypes(organizationId: string): Promise<ReadonlyMap<string, unknown>> {
    return this.prisma.clientSegment
      .findMany({ where: { organization_id: organizationId }, select: { name: true, type: true } })
      .then(
        (segments) =>
          new Map(
            segments.map((segment) => [
              String(segment.name).toLocaleLowerCase("pt-BR"),
              segment.type,
            ]),
          ),
      );
  }
}
