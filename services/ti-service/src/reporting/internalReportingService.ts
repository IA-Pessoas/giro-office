import { ServiceError } from "@workspace/shared";

import {
  getTiStockReportingFields,
  type TiStockReportingSource,
} from "./tiStockReportingCatalog.js";

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
  category?: { is: { organization_id: string } };
  location?: { is: { organization_id: string } };
};

type ReportingDelegate = {
  findMany(input: {
    where: ReportingWhere;
    select: ReportingSelect;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

function projectRows(
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
  constructor(private readonly prisma: { stock: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: TiStockReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getTiStockReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const select = Object.fromEntries(
      input.fields.map((field) => [
        field,
        field === "category" || field === "location" ? { select: { name: true } } : true,
      ]),
    ) as ReportingSelect;
    const where: ReportingWhere = { organization_id: input.organizationId };
    if (input.fields.includes("category")) {
      where.category = { is: { organization_id: input.organizationId } };
    }
    if (input.fields.includes("location")) {
      where.location = { is: { organization_id: input.organizationId } };
    }
    const rows = await this.prisma.stock.findMany({
      where,
      select,
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
