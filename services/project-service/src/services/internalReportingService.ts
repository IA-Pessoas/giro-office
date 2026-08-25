import {
  getProjectReportingFields,
  type ProjectReportingSource,
  ServiceError,
} from "@workspace/shared";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
  }): Promise<readonly Record<string, unknown>[]>;
};

export class InternalReportingService {
  constructor(private readonly prisma: { project: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: ProjectReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    const allowedFields = getProjectReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.project.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      take: input.limit + 1,
    });

    return { rows: rows.slice(0, input.limit), reachedLimit: rows.length > input.limit };
  }
}
