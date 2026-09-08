import {
  getTiInventoryReportingFields,
  ServiceError,
  type TiInventoryReportingSource,
  tiInventoryReportingCatalog,
} from "@workspace/shared";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

const fieldSelects: Record<string, Record<string, unknown>> = {
  asset_code: { asset_code: true },
  category: { category: { select: { name: true } } },
  location: { location: { select: { name: true } } },
  delivery_date: { delivery_date: true },
  return_date: { return_date: true },
  notes: { notes: true },
};

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => {
        if (field === "category" || field === "location") {
          const relation = row[field];
          return [
            field,
            relation && typeof relation === "object" && "name" in relation
              ? (relation as { name: unknown }).name
              : null,
          ];
        }
        return [field, row[field]];
      }),
    ),
  );
}

export class TiInventoryReportingService {
  readonly catalog = tiInventoryReportingCatalog;

  constructor(private readonly prisma: { inventoryTecnologia: ReportingDelegate }) {}

  async extract(input: {
    offset?: number;
    organizationId: string;
    source: TiInventoryReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getTiInventoryReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.inventoryTecnologia.findMany({
      where: { organization_id: input.organizationId },
      select: Object.assign({}, ...input.fields.map((field) => fieldSelects[field])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
