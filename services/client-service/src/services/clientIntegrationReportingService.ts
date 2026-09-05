import { ServiceError } from "@workspace/shared";

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
  }): Promise<readonly Record<string, unknown>[]>;
};

export class ClientIntegrationReportingService {
  constructor(private readonly prisma: PrismaClient) {}

  async extract(input: {
    organizationId: string;
    source: ClientIntegrationReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<readonly Record<string, unknown>[]> {
    const allowedFields = getClientIntegrationReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    return (this.prisma.client as unknown as ReportingDelegate).findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit,
    });
  }
}
