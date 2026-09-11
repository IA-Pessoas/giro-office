import {
  executeReportingQuery,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  type ClientIntegrationReportingSource,
  getClientIntegrationReportingFields,
} from "../reporting/clientIntegrationReportingCatalog.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

export class ClientIntegrationReportingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: ClientIntegrationReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new ClientIntegrationReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      const result = await executeReportingQuery(
        { ...input, query: input.query },
        async (fields, limit, offset) => {
          const rows = await this.extract({ ...input, query: undefined, fields, limit, offset });
          return { rows, reachedLimit: rows.length === limit };
        },
      );
      return result;
    }
    const allowedFields = getClientIntegrationReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await (this.prisma.client as unknown as ReportingDelegate).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
  }
}
