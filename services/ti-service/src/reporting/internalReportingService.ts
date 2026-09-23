import { Buffer } from "node:buffer";
import {
  executeReportingQuery,
  MAX_REPORTING_QUERY_BYTES,
  MAX_REPORTING_QUERY_ROWS,
  REPORTING_QUERY_BYTE_LIMIT_CODE,
  REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
  REPORTING_QUERY_ROW_LIMIT_CODE,
  type ReportingQuery,
  ServiceError,
  type TiExtensionsReportingSource,
  type TiInventoryReportingSource,
  type TiRequestsReportingSource,
  tiExtensionsReportingCatalog,
  tiInventoryReportingCatalog,
  tiRequestsReportingCatalog,
  withReportingSnapshot,
} from "@workspace/shared";
import { TiDepartmentResolverService } from "../services/tiDepartmentResolverService.js";
import { createReportingPage, cursorOptions, type ReportingPage } from "./reportingPagination.js";
import { TiExtensionsReportingService } from "./tiExtensionsReportingService.js";
import { TiInventoryReportingService } from "./tiInventoryReportingService.js";
import { TiRequestsReportingService } from "./tiRequestsReportingService.js";
import {
  getTiStockReportingFields,
  type TiStockReportingSource,
  tiStockReportingCatalog,
} from "./tiStockReportingCatalog.js";

type ReportingSource =
  | TiExtensionsReportingSource
  | TiInventoryReportingSource
  | TiRequestsReportingSource
  | TiStockReportingSource;

type ReportingSelect = {
  id?: true;
  name?: true;
  category?: { select: { name: true } };
  location?: { select: { name: true } };
  quantity?: true;
  description?: true;
  status?: true;
};

type ReportingWhere = {
  organization_id: string;
  department_id: string;
  category?: { is: { organization_id: string; department_id: string } };
  location?: { is: { organization_id: string; department_id: string } };
};

type ReportingDelegate = {
  findMany(input: {
    where: ReportingWhere;
    select: ReportingSelect;
    take: number;
    cursor?: { id: string };
    skip?: number;
    orderBy: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type InventoryReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
    cursor?: { id: string };
    skip?: number;
    orderBy: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

type RequestsReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
    cursor?: { id: string };
    skip?: number;
    orderBy: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

const REPORTING_DB_PAGE_SIZE = 100;

function throwSnapshotByteLimit(): never {
  throw new ServiceError(
    422,
    REPORTING_QUERY_BYTE_LIMIT_MESSAGE,
    undefined,
    REPORTING_QUERY_BYTE_LIMIT_CODE,
  );
}

function throwSnapshotRowLimit(): never {
  throw new ServiceError(
    422,
    "O conjunto excede a capacidade de consulta do relatório.",
    undefined,
    REPORTING_QUERY_ROW_LIMIT_CODE,
  );
}

async function readReportingRows(
  limit: number,
  loadPage: (limit: number, cursor?: string) => Promise<ReportingPage>,
): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
  const requested = limit + 1;
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  let reachedLimit = false;
  let bytes = 2;

  while (rows.length < requested) {
    const pageLimit = Math.min(REPORTING_DB_PAGE_SIZE, requested - rows.length);
    const page = await loadPage(pageLimit, cursor);
    if (!page.rows.length && page.reachedLimit) {
      throw new ServiceError(422, "A origem não conseguiu completar a consulta.");
    }
    for (const row of page.rows) {
      bytes += (rows.length ? 1 : 0) + Buffer.byteLength(JSON.stringify(row), "utf8");
      if (bytes > MAX_REPORTING_QUERY_BYTES) throwSnapshotByteLimit();
      if (rows.length >= MAX_REPORTING_QUERY_ROWS) throwSnapshotRowLimit();
      rows.push(row);
    }

    reachedLimit = page.reachedLimit;
    if (!page.reachedLimit || rows.length >= requested) break;
    if (!page.nextCursor || page.nextCursor === cursor) {
      throw new ServiceError(500, "Falha ao continuar a extração do relatório.");
    }
    cursor = page.nextCursor;
  }

  return { rows, reachedLimit };
}

type DepartmentReportingDelegate = {
  findFirst(input: {
    where: { organization_id: string; name: { equals: string; mode: "insensitive" } };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

function withoutKeys<T extends { keys: readonly unknown[] }>(source: T) {
  const { keys: _keys, ...publicSource } = source;
  return publicSource;
}

const publicCatalog = {
  sources: [
    ...tiExtensionsReportingCatalog.sources.map(withoutKeys),
    ...tiInventoryReportingCatalog.sources.map(withoutKeys),
    ...tiRequestsReportingCatalog.sources.map(withoutKeys),
    ...tiStockReportingCatalog.sources.map(withoutKeys),
  ],
  relations: [],
} as const;

function projectStockRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields
        .map((field) => {
          if (field === "category" || field === "location") {
            const relation = row[field];
            return [
              field,
              relation && typeof relation === "object" && "name" in relation
                ? (relation as { name: unknown }).name
                : undefined,
            ];
          }
          return [field, row[field]];
        })
        .filter(([, value]) => value !== undefined),
    ),
  );
}

export class InternalReportingService {
  readonly catalog = publicCatalog;
  private readonly extensions: TiExtensionsReportingService;
  private readonly inventory: TiInventoryReportingService;
  private readonly requests: TiRequestsReportingService;
  private readonly departmentResolver: TiDepartmentResolverService;

  constructor(
    private readonly prisma: {
      department: DepartmentReportingDelegate;
      extensionsTecnologia: InventoryReportingDelegate;
      inventoryTecnologia: InventoryReportingDelegate;
      tIRequest: RequestsReportingDelegate;
      stock: ReportingDelegate;
    },
    private readonly inSnapshot = false,
  ) {
    this.extensions = new TiExtensionsReportingService({
      extensionsTecnologia: prisma.extensionsTecnologia,
    });
    this.inventory = new TiInventoryReportingService({
      inventoryTecnologia: prisma.inventoryTecnologia,
    });
    this.requests = new TiRequestsReportingService({ tIRequest: prisma.tIRequest });
    this.departmentResolver = new TiDepartmentResolverService(prisma);
  }

  async extract(input: {
    query?: ReportingQuery;
    organizationId: string;
    source: ReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if ((input.query || input.limit + 1 > REPORTING_DB_PAGE_SIZE) && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }

    let departmentIdPromise: Promise<string> | undefined;
    const loadPage = async (
      fields: readonly string[],
      limit: number,
      cursor?: string,
    ): Promise<ReportingPage> => {
      let departmentId: string | undefined;
      if (input.source === "ti.stock") {
        if (!departmentIdPromise) {
          departmentIdPromise = this.departmentResolver.resolveTechnologyDepartmentId(
            input.organizationId,
          );
        }
        departmentId = await departmentIdPromise;
      }
      return this.loadPage({
        organizationId: input.organizationId,
        source: input.source,
        fields,
        limit,
        cursor,
        ...(departmentId === undefined ? {} : { departmentId }),
      });
    };

    if (input.query) {
      return executeReportingQuery(
        { ...input, query: input.query },
        { loadPage: (fields, limit, cursor) => loadPage(fields, limit, cursor) },
      );
    }

    if (input.source === "ti.stock") {
      const allowedFields = getTiStockReportingFields(input.source);
      if (input.fields.some((field) => !allowedFields.includes(field))) {
        throw new ServiceError(403, "Campo não publicado para relatórios.");
      }
    }

    const result = await readReportingRows(input.limit, (limit, cursor) =>
      loadPage(input.fields, limit, cursor),
    );
    return {
      rows: result.rows.slice(0, input.limit),
      reachedLimit: result.rows.length > input.limit || result.reachedLimit,
    };
  }

  private async loadPage(input: {
    organizationId: string;
    source: ReportingSource;
    fields: readonly string[];
    limit: number;
    cursor?: string;
    departmentId?: string;
  }): Promise<ReportingPage> {
    if (input.source === "ti.inventory") {
      return this.inventory.extract({
        organizationId: input.organizationId,
        source: input.source,
        fields: input.fields,
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursorId: input.cursor }),
      });
    }
    if (input.source === "ti.extensions") {
      return this.extensions.extract({
        organizationId: input.organizationId,
        source: input.source,
        fields: input.fields,
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursorId: input.cursor }),
      });
    }
    if (input.source === "ti.requests") {
      return this.requests.extract({
        organizationId: input.organizationId,
        source: input.source,
        fields: input.fields,
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursorId: input.cursor }),
      });
    }

    const departmentId = input.departmentId;
    if (!departmentId) throw new ServiceError(500, "Departamento de Tecnologia indisponível.");
    const allowedFields = getTiStockReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }
    const select = Object.fromEntries([
      ["id", true],
      ...input.fields.map((field) => [
        field,
        field === "category" || field === "location" ? { select: { name: true } } : true,
      ]),
    ]) as ReportingSelect;
    const where: ReportingWhere = {
      organization_id: input.organizationId,
      department_id: departmentId,
    };
    if (input.fields.includes("category")) {
      where.category = {
        is: { organization_id: input.organizationId, department_id: departmentId },
      };
    }
    if (input.fields.includes("location")) {
      where.location = {
        is: { organization_id: input.organizationId, department_id: departmentId },
      };
    }
    const rows = await this.prisma.stock.findMany({
      where,
      select,
      ...cursorOptions(input.cursor),
      take: input.limit + 1,
    });
    const page = createReportingPage(rows, input.limit);
    return {
      ...page,
      rows: projectStockRows(page.rows, input.fields),
    };
  }
}
