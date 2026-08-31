import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  getPessoalLddReportingFields,
  type PessoalLddReportingSource,
} from "./pessoalLddReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(private readonly prisma: Pick<PrismaClient, "lddPessoal">) {}

  async extract(input: {
    organizationId: string;
    source: PessoalLddReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getPessoalLddReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await (this.prisma.lddPessoal as unknown as ReportingDelegate).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit + 1,
    });

    return {
      rows: rows
        .slice(0, input.limit)
        .map((row) =>
          Object.fromEntries(
            input.fields
              .filter((field) => Object.getOwnPropertyDescriptor(row, field) !== undefined)
              .map((field) => [field, row[field]]),
          ),
        ),
      reachedLimit: rows.length > input.limit,
    };
  }
}
