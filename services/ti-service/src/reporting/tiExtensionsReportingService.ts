import {
  getTiExtensionsReportingFields,
  ServiceError,
  type TiExtensionsReportingSource,
  tiExtensionsReportingCatalog,
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
  number: { number: true },
  created_at: { createdAt: true },
  updated_at: { updatedAt: true },
};

function projectRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): readonly Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [
        field,
        row[field === "created_at" ? "createdAt" : field === "updated_at" ? "updatedAt" : field],
      ]),
    ),
  );
}

export class TiExtensionsReportingService {
  readonly catalog = tiExtensionsReportingCatalog;

  constructor(private readonly prisma: { extensionsTecnologia: ReportingDelegate }) {}

  async extract(input: {
    offset?: number;
    organizationId: string;
    source: TiExtensionsReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getTiExtensionsReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.extensionsTecnologia.findMany({
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
