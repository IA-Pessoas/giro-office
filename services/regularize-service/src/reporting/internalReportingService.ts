import { ServiceError } from "@workspace/shared";

import {
  getRegularizeLicenseReportingFields,
  type RegularizeLicenseReportingSource,
} from "./regularizeLicenseReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

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
  constructor(private readonly prisma: { license: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: RegularizeLicenseReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getRegularizeLicenseReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.license.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit + 1,
    });

    return {
      rows: projectRows(rows.slice(0, input.limit), input.fields),
      reachedLimit: rows.length > input.limit,
    };
  }
}
