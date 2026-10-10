import {
  type ContabilReportingSource,
  executeReportingQuery,
  getContabilReportingFields,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import { extractTriageReportingPage, isTriageReportingSource } from "./triageReportingService.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(
    private readonly prisma: {
      controlContabil: ReportingDelegate;
      responsibleContabil: ReportingDelegate;
      relationshipContabil: ReportingDelegate;
      client: ReportingDelegate;
      clientClouds: ReportingDelegate;
      triageMonthly: ReportingDelegate;
      triageResponsible: ReportingDelegate;
      triageCompetence: ReportingDelegate;
      triageConfig: ReportingDelegate;
      user: ReportingDelegate;
    },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: ContabilReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new InternalReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields = getContabilReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }
    if (isTriageReportingSource(input.source)) {
      return extractTriageReportingPage(
        {
          clients: this.prisma.client,
          clouds: this.prisma.clientClouds,
          monthly: this.prisma.triageMonthly,
          responsibles: this.prisma.responsibleContabil,
          assignments: this.prisma.triageResponsible,
          competences: this.prisma.triageCompetence,
          configs: this.prisma.triageConfig,
          users: this.prisma.user,
        },
        { ...input, source: input.source },
      );
    }

    const delegate =
      input.source === "contabil.control"
        ? this.prisma.controlContabil
        : input.source === "contabil.responsibles"
          ? this.prisma.responsibleContabil
          : this.prisma.relationshipContabil;
    const rows = await delegate.findMany({
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
