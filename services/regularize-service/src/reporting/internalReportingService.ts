import {
  collectReportingRows,
  executeReportingQuery,
  REPORTING_QUERY_PAGE_SIZE as REPORTING_DB_PAGE_SIZE,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import { OPERATIONAL_PROCESS_FILTER } from "../schemas/status.schemas.js";
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
    select: Record<string, true>;
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

    const filter = input.source === "regularize.licenses" ? {} : OPERATIONAL_PROCESS_FILTER;
    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      loadReportingPage(delegate, input.organizationId, fields, limit, cursor, filter);
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
const PORTFOLIO_DERIVED_FIELDS = new Set([
  "segment_type",
  "has_passwords",
  "group_name",
  "group_active",
]);

export class RegularizePortfolioReportingService {
  private segmentTypes?: Promise<ReadonlyMap<string, unknown>>;

  constructor(
    private readonly prisma: {
      client: PortfolioDelegate;
      clientsGroup: PortfolioDelegate;
      clientSegment: PortfolioDelegate;
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

    const loadPage = (fields: readonly string[], limit: number, cursor?: string) =>
      this.loadPage(input.organizationId, input.source, fields, limit, cursor);
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
    cursor?: string,
  ): Promise<ReportingPage> {
    const columns = new Set(fields.filter((field) => !PORTFOLIO_DERIVED_FIELDS.has(field)));
    if (fields.includes("segment_type")) columns.add("segment");
    const select = Object.fromEntries(["id", ...columns].map((field) => [field, true]));
    const paging = {
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      orderBy: { id: "asc" },
      take: limit + 1,
    };
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

    const segmentTypes = fields.includes("segment_type")
      ? await this.loadSegmentTypes(organizationId)
      : undefined;
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

    const rows = page.map((row, index) => {
      const client = clients[index] ?? {};
      const group = (row.group ?? {}) as { name?: unknown; status?: unknown };
      const derived: Record<string, unknown> = {
        group_name: group.name,
        group_active: group.status,
        has_passwords: withPasswords?.has(client.id),
        segment_type:
          segmentTypes?.get(String(client.segment ?? "").toLocaleLowerCase("pt-BR")) ?? null,
        status: REGULARIZE_PORTFOLIO_LEGACY_STATUS[String(client.status)] ?? client.status,
      };
      return Object.fromEntries(
        fields.map((field) => [field, field in derived ? derived[field] : client[field]]),
      );
    });
    const lastId = page[page.length - 1]?.id;
    const reachedLimit = found.length > limit;
    return {
      rows,
      reachedLimit,
      ...(reachedLimit && typeof lastId === "string" ? { nextCursor: lastId } : {}),
    };
  }

  // O cliente guarda o nome do segmento; o tipo vem do catálogo, sem diferenciar maiúsculas.
  private loadSegmentTypes(organizationId: string): Promise<ReadonlyMap<string, unknown>> {
    this.segmentTypes ??= this.prisma.clientSegment
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
    return this.segmentTypes;
  }
}
