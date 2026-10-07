import {
  CLIENT_GROUP_REPORTING_SOURCE,
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

type ClientGroupReportingDelegate = {
  findMany(input: {
    where: {
      organization_id: string;
      group: { is: { organization_id: string } };
      client: { is: { organization_id: string } };
    };
    select: Record<string, unknown>;
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
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields = getClientIntegrationReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    if (input.source === CLIENT_GROUP_REPORTING_SOURCE) {
      const clientFields = input.fields.filter(
        (field) => !["client_id", "group_id", "group_name"].includes(field),
      );
      const memberships = await (
        this.prisma.clientsGroup as unknown as ClientGroupReportingDelegate
      ).findMany({
        where: {
          organization_id: input.organizationId,
          group: { is: { organization_id: input.organizationId } },
          client: { is: { organization_id: input.organizationId } },
        },
        select: {
          id: true,
          client_id: true,
          group_id: true,
          client: { select: Object.fromEntries(clientFields.map((field) => [field, true])) },
          group: { select: { name: true } },
        },
        ...(input.offset !== undefined
          ? { skip: input.offset, orderBy: { id: "asc" as const } }
          : {}),
        take: input.limit + 1,
      });
      const rows = memberships.map((membership) => {
        const client = membership.client as Record<string, unknown>;
        const group = membership.group as { name: string };
        return Object.fromEntries(
          input.fields.map((field) => [
            field,
            field === "client_id"
              ? membership.client_id
              : field === "group_id"
                ? membership.group_id
                : field === "group_name"
                  ? group.name
                  : client[field],
          ]),
        );
      });
      return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
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
