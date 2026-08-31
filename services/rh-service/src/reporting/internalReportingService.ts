import { ServiceError } from "@workspace/shared";

import {
  getRhRequestReportingFields,
  type RhRequestReportingSource,
} from "./rhRequestReportingCatalog.js";

type ReportingSelect = {
  title?: true;
  category?: { select: { name: true } };
  urgency?: true;
  status?: true;
  created_at?: true;
  updated_at?: true;
};

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
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
          if (field === "category") {
            const category = row.category;
            return [
              field,
              category && typeof category === "object" && "name" in category
                ? (category as { name: unknown }).name
                : undefined,
            ];
          }
          return [field, row[field]];
        })
        .filter(([, value]) => value !== undefined),
    ),
  );
}

const reportingSelect: ReportingSelect = {
  title: true,
  category: { select: { name: true } },
  urgency: true,
  status: true,
  created_at: true,
  updated_at: true,
};

export class InternalReportingService {
  constructor(private readonly prisma: { rhRequest: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: RhRequestReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getRhRequestReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.rhRequest.findMany({
      where: { organization_id: input.organizationId },
      select: reportingSelect,
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
