import { PESSOAL_LDD_REPORTING_SOURCES, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  getPessoalReportingFields,
  PESSOAL_REPORTING_SOURCES,
  type PessoalReportingSource,
} from "./pessoalReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(
    private readonly prisma: Pick<PrismaClient, "lddPessoal" | "payroll" | "obrigationsPessoal">,
  ) {}

  async extract(input: {
    organizationId: string;
    source: PessoalReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (!PESSOAL_REPORTING_SOURCES.includes(input.source)) {
      throw new ServiceError(403, "Fonte não publicada para relatórios.");
    }

    const allowedFields = getPessoalReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate =
      input.source === PESSOAL_LDD_REPORTING_SOURCES[0]
        ? this.prisma.lddPessoal
        : input.source === "pessoal.payroll"
          ? this.prisma.payroll
          : this.prisma.obrigationsPessoal;
    const rows = await (delegate as unknown as ReportingDelegate).findMany({
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
