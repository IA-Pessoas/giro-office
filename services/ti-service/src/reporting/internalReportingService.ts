import {
  ServiceError,
  type TiInventoryReportingSource,
  type TiRequestsReportingSource,
  tiInventoryReportingCatalog,
  tiRequestsReportingCatalog,
} from "@workspace/shared";
import { TiDepartmentResolverService } from "../services/tiDepartmentResolverService.js";
import { TiInventoryReportingService } from "./tiInventoryReportingService.js";
import { TiRequestsReportingService } from "./tiRequestsReportingService.js";
import {
  getTiStockReportingFields,
  type TiStockReportingSource,
  tiStockReportingCatalog,
} from "./tiStockReportingCatalog.js";

type ReportingSource =
  | TiInventoryReportingSource
  | TiRequestsReportingSource
  | TiStockReportingSource;

type ReportingSelect = {
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
  }): Promise<readonly Record<string, unknown>[]>;
};

type InventoryReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

type RequestsReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

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
  private readonly inventory: TiInventoryReportingService;
  private readonly requests: TiRequestsReportingService;
  private readonly departmentResolver: TiDepartmentResolverService;

  constructor(
    private readonly prisma: {
      department: DepartmentReportingDelegate;
      inventoryTecnologia: InventoryReportingDelegate;
      tIRequest: RequestsReportingDelegate;
      stock: ReportingDelegate;
    },
  ) {
    this.inventory = new TiInventoryReportingService({
      inventoryTecnologia: prisma.inventoryTecnologia,
    });
    this.requests = new TiRequestsReportingService({ tIRequest: prisma.tIRequest });
    this.departmentResolver = new TiDepartmentResolverService(prisma);
  }

  async extract(input: {
    organizationId: string;
    source: ReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.source === "ti.inventory") {
      return this.inventory.extract({
        organizationId: input.organizationId,
        source: input.source,
        fields: input.fields,
        limit: input.limit,
      });
    }

    if (input.source === "ti.requests") {
      return this.requests.extract({
        organizationId: input.organizationId,
        source: input.source,
        fields: input.fields,
        limit: input.limit,
      });
    }

    const allowedFields = getTiStockReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const departmentId = await this.departmentResolver.resolveTechnologyDepartmentId(
      input.organizationId,
    );
    const select = Object.fromEntries(
      input.fields.map((field) => [
        field,
        field === "category" || field === "location" ? { select: { name: true } } : true,
      ]),
    ) as ReportingSelect;
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
      take: input.limit + 1,
    });

    return {
      rows: projectStockRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
