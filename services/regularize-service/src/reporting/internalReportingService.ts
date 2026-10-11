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
  clientName,
  portfolioPage,
  portfolioPaging,
  type ReportingPage,
} from "./regularizePortfolioReportingService.js";
import {
  getRegularizeProcessReportingFields,
  type RegularizeProcessReportingSource,
} from "./regularizeProcessReportingCatalog.js";

// A carteira (clientes, grupos, PF e sócios) fica em arquivo próprio; o caminho de importação
// continua este.
export { RegularizePortfolioReportingService } from "./regularizePortfolioReportingService.js";

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
