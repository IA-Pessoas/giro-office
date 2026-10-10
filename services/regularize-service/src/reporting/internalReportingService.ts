import {
  collectReportingRows,
  executeReportingQuery,
  REPORTING_QUERY_PAGE_SIZE as REPORTING_DB_PAGE_SIZE,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import {
  canonicalLicenseStatus,
  canonicalProcessStatus,
  OPERATIONAL_PROCESS_FILTER,
} from "../schemas/status.schemas.js";
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

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string } & Record<string, unknown>;
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

// Relações saem com organization_id para descartar vínculo de outra organização.
const RELATED_NAME = { select: { name: true, organization_id: true } };
const RELATED_CLIENT = { select: { name: true, company_name: true, organization_id: true } };
const PROCESS_RESPONSIBLES = ["responsible1", "responsible2", "responsible3"] as const;

function reportingMonth(value: unknown): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 7) : null;
}

function sameOrganization(relation: unknown, organizationId: string): Record<string, unknown> {
  const candidate = (relation ?? {}) as Record<string, unknown>;
  return candidate.organization_id === organizationId ? candidate : {};
}

function clientName(client: Record<string, unknown>): unknown {
  return client.company_name || client.name || null;
}

// O campo é texto livre no cadastro atual. A migração trouxe para ele a data de notificação
// do legado (travamento_cliente_notificacao), que o PHP só gravava em travamento por cliente
// e zerava nos demais casos (regularize/pages/processos/editar.php).
function processLockingType(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || text.startsWith("0000-00-00")) return null;
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? "Cliente" : text;
}

// A migração gravou em License.type o código de travamento do legado (alvaras.tipo, de 1 a 7,
// rótulos de relatorios/paralisacao.php). O cadastro atual usa o mesmo campo para outra coisa
// ("Anual" etc.), que não é travamento.
const LICENSE_LOCKING_TYPES: Readonly<Record<string, string>> = {
  1: "Cliente",
  2: "Diretoria",
  3: "Órgão público",
  4: "Departamento",
  5: "Outros",
  6: "Departamento Fiscal",
  7: "Departamento Pessoal",
};

function licenseLockingType(value: unknown): string | null {
  const code = String(value ?? "").trim();
  return Object.keys(LICENSE_LOCKING_TYPES).includes(code) ? LICENSE_LOCKING_TYPES[code] : null;
}

// Fonte com campos montados na extração: o que cada um precisa ler e como sai a linha.
// Campo fora de `needs` é coluna da tabela.
type DerivedReportingSource = {
  where?: Record<string, unknown>;
  needs: Readonly<Record<string, Record<string, unknown>>>;
  derive(row: Record<string, unknown>, organizationId: string): Record<string, unknown>;
};

const PROCESS_REPORTING: DerivedReportingSource = {
  where: OPERATIONAL_PROCESS_FILTER,
  needs: {
    client_name: { clientPJ: RELATED_CLIENT, clientPF: RELATED_NAME },
    responsible1_name: { responsible1: RELATED_NAME },
    responsible_names: Object.fromEntries(PROCESS_RESPONSIBLES.map((key) => [key, RELATED_NAME])),
    entry_month: { entry_date: true },
    completion_month: { completion_date: true },
    locked: { locking_type: true },
  },
  derive(process, organizationId) {
    const person = sameOrganization(process.clientPF, organizationId);
    const responsibles = PROCESS_RESPONSIBLES.map(
      (key) => sameOrganization(process[key], organizationId).name ?? null,
    );
    const lockingType = processLockingType(process.locking_type);
    return {
      client_name:
        clientName(sameOrganization(process.clientPJ, organizationId)) || person.name || null,
      responsible1_name: responsibles[0],
      responsible_names: responsibles.filter((name) => name !== null).join(", ") || null,
      entry_month: reportingMonth(process.entry_date),
      completion_month: reportingMonth(process.completion_date),
      locking_type: lockingType,
      locked: lockingType !== null,
      status: canonicalProcessStatus(process.status),
    };
  },
};

const LICENSE_REPORTING: DerivedReportingSource = {
  needs: {
    client_name: { client: RELATED_CLIENT },
    responsible_name: { responsible: RELATED_NAME },
    entry_month: { entry_date: true },
    locking_type: { type: true },
    locked: { type: true },
  },
  derive(license, organizationId) {
    const lockingType = licenseLockingType(license.type);
    return {
      client_name: clientName(sameOrganization(license.client, organizationId)),
      responsible_name: sameOrganization(license.responsible, organizationId).name ?? null,
      entry_month: reportingMonth(license.entry_date),
      locking_type: lockingType,
      locked: lockingType !== null,
      status: canonicalLicenseStatus(license.status),
    };
  },
};

const MUNICIPAL_TAXES_CLIENT = {
  client: {
    select: {
      name: true,
      company_name: true,
      city: true,
      municipal_registration: true,
      organization_id: true,
    },
  },
};

const MUNICIPAL_TAXES_REPORTING: DerivedReportingSource = {
  needs: {
    client_name: MUNICIPAL_TAXES_CLIENT,
    client_city: MUNICIPAL_TAXES_CLIENT,
    client_municipal_registration: MUNICIPAL_TAXES_CLIENT,
  },
  derive(taxes, organizationId) {
    const client = sameOrganization(taxes.client, organizationId);
    return {
      client_name: clientName(client),
      client_city: client.city ?? null,
      client_municipal_registration: client.municipal_registration ?? null,
    };
  },
};

async function loadDerivedReportingPage(
  source: DerivedReportingSource,
  delegate: ReportingDelegate,
  organizationId: string,
  fields: readonly string[],
  limit: number,
  cursor?: string,
): Promise<ReportingPage> {
  const select: Record<string, unknown> = { id: true };
  for (const field of fields) {
    Object.assign(select, source.needs[field] ?? { [field]: true });
  }
  const found = await delegate.findMany({
    where: { organization_id: organizationId, ...source.where },
    select,
    ...portfolioPaging(limit, cursor),
  });
  const rows = found.slice(0, limit).map((row) => {
    const derived = source.derive(row, organizationId);
    return Object.fromEntries(
      fields
        .map((field) => [field, field in derived ? derived[field] : row[field]])
        .filter(([, value]) => value !== undefined),
    );
  });
  return portfolioPage(found, limit, rows);
}

// Definições salvas antes da normalização filtram pelo alias; o valor é levado ao canônico.
function canonicalStatusQuery(
  query: ReportingQuery,
  canonical: (status: unknown) => unknown,
): ReportingQuery {
  return {
    ...query,
    filters: query.filters?.map((filter) =>
      filter.field === "status"
        ? {
            ...filter,
            value: Array.isArray(filter.value)
              ? filter.value.map(canonical)
              : canonical(filter.value),
          }
        : filter,
    ),
  };
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

    const licenses = input.source === "regularize.licenses";
    const source = licenses ? LICENSE_REPORTING : PROCESS_REPORTING;
    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      loadDerivedReportingPage(source, delegate, input.organizationId, fields, limit, cursor);
    if (input.query) {
      const query = canonicalStatusQuery(
        input.query,
        licenses ? canonicalLicenseStatus : canonicalProcessStatus,
      );
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
      loadDerivedReportingPage(
        MUNICIPAL_TAXES_REPORTING,
        this.prisma.municipalTaxes,
        input.organizationId,
        fields,
        limit,
        cursor,
      );
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
  "dte_eligible",
  "dte_missing_data",
  "has_passwords",
  "has_partners",
  "group_name",
  "group_active",
]);

// Filtro DTE do legado (regularize/pages/relatorios/estados.php): cliente ativo ou em
// inativação, segmento de comércio ou indústria e inscrição estadual diferente de ISENTO.
const DTE_COLUMNS = ["status", "segment", "state", "state_registration"];
const DTE_SEGMENT_TYPES: readonly unknown[] = ["comercio", "industria"];
const DTE_STATUSES: readonly unknown[] = [
  REGULARIZE_PORTFOLIO_LEGACY_STATUS.A,
  REGULARIZE_PORTFOLIO_LEGACY_STATUS.P,
];

function blank(value: unknown): boolean {
  return String(value ?? "").trim() === "";
}

function dteEligibility(
  client: Record<string, unknown>,
  segmentType: unknown,
): { dte_eligible: boolean; dte_missing_data: string | null } {
  const exempt =
    String(client.state_registration ?? "")
      .trim()
      .toUpperCase() === "ISENTO";
  // Sem inscrição o PHP listava o cliente (vazio é diferente de ISENTO); sem segmento não
  // dá para dizer o tipo e o cliente fica fora. Os dois casos saem sinalizados.
  const missing = [
    blank(client.segment) ? "Segmento" : null,
    blank(client.state_registration) ? "Inscrição estadual" : null,
    blank(client.state) ? "UF" : null,
  ].filter((item) => item !== null);
  return {
    dte_eligible:
      DTE_STATUSES.includes(portfolioStatus(client.status)) &&
      DTE_SEGMENT_TYPES.includes(segmentType) &&
      !exempt,
    dte_missing_data: missing.join("; ") || null,
  };
}

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
    const dte = fields.includes("dte_eligible") || fields.includes("dte_missing_data");
    if (fields.includes("segment_type")) columns.add("segment");
    if (dte) for (const column of DTE_COLUMNS) columns.add(column);
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

    const segmentTypes =
      dte || fields.includes("segment_type") ? await loadSegmentTypes() : undefined;
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
      const segmentType =
        segmentTypes?.get(
          String(client.segment ?? "")
            .trim()
            .toLocaleLowerCase("pt-BR"),
        ) ?? null;
      const derived: Record<string, unknown> = {
        group_name: group.name,
        group_active: group.status,
        has_passwords: withPasswords?.has(client.id),
        has_partners: withPartners?.has(client.id),
        segment_type: segmentType,
        ...(dte ? dteEligibility(client, segmentType) : {}),
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
