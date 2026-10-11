import {
  type ContabilReportingSource,
  executeReportingQuery,
  getContabilReportingFields,
  type ReportingQuery,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";

import { extractTriageReportingPage } from "./triageReportingService.js";

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
      triageCatalogItem: ReportingDelegate;
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
    return extractTriageReportingPage(
      {
        clients: this.prisma.client,
        clouds: this.prisma.clientClouds,
        control: this.prisma.controlContabil,
        monthly: this.prisma.triageMonthly,
        relationships: this.prisma.relationshipContabil,
        responsibles: this.prisma.responsibleContabil,
        assignments: this.prisma.triageResponsible,
        competences: this.prisma.triageCompetence,
        configs: this.prisma.triageConfig,
        catalogItems: this.prisma.triageCatalogItem,
        users: this.prisma.user,
      },
      input,
    );
  }
}
