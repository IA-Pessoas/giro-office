import { ServiceError } from "@workspace/shared";

import {
  getRhHolidayReportingFields,
  type RhHolidayReportingSource,
} from "./rhHolidayReportingCatalog.js";
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

type HolidayReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: { name: true; date: true };
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

const holidayReportingSelect = { name: true, date: true } as const;

export class InternalReportingService {
  constructor(
    private readonly prisma: { rhRequest?: ReportingDelegate; holidays?: HolidayReportingDelegate },
  ) {}

  async extract(input: {
    organizationId: string;
    source: RhRequestReportingSource | RhHolidayReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields =
      input.source === "rh.holidays"
        ? getRhHolidayReportingFields(input.source)
        : getRhRequestReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    if (input.source === "rh.holidays") {
      if (!this.prisma.holidays) {
        throw new ServiceError(500, "Fonte de relatórios indisponível.");
      }
      const rows = await this.prisma.holidays.findMany({
        where: { organization_id: input.organizationId },
        select: holidayReportingSelect,
        take: input.limit + 1,
      });

      return {
        rows: projectRows(rows.slice(0, input.limit), input.fields),
        reachedLimit: rows.length > input.limit,
      };
    }

    if (!this.prisma.rhRequest) {
      throw new ServiceError(500, "Fonte de relatórios indisponível.");
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
