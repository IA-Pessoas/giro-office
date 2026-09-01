import {
  getTiRequestsReportingFields,
  ServiceError,
  type TiRequestsReportingSource,
  tiRequestsReportingCatalog,
} from "@workspace/shared";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, unknown>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

const fieldSelects: Record<string, Record<string, unknown>> = {
  title: { title: true },
  category: { category: { select: { name: true } } },
  urgency: { urgency: true },
  status: { status: true },
  created_at: { created_at: true },
  updated_at: { updated_at: true },
};

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => {
        if (field === "category") {
          const category = row.category;
          return [
            field,
            category && typeof category === "object" && "name" in category
              ? (category as { name: unknown }).name
              : null,
          ];
        }
        return [field, row[field]];
      }),
    ),
  );
}

export class TiRequestsReportingService {
  readonly catalog = tiRequestsReportingCatalog;

  constructor(private readonly prisma: { tIRequest: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: TiRequestsReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getTiRequestsReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.tIRequest.findMany({
      where: { organization_id: input.organizationId },
      select: Object.assign({}, ...input.fields.map((field) => fieldSelects[field])),
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
