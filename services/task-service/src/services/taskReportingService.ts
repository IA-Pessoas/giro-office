import {
  executeReportingQuery,
  getTaskReportingFields,
  type ReportingQuery,
  ServiceError,
  type TaskReportingSource,
  withReportingSnapshot,
} from "@workspace/shared";

type ReportingTask = Record<string, unknown> & { department?: { name: string } };
type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true | { select: { name: true } }>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly ReportingTask[]>;
};

export class TaskReportingService {
  constructor(
    private readonly prisma: { task: ReportingDelegate },
    private readonly inSnapshot = false,
  ) {}

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: TaskReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new TaskReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }
    const allowedFields = getTaskReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const rows = await this.prisma.task.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(
        input.fields.map((field) => [
          field,
          field === "department" ? { select: { name: true } } : true,
        ]),
      ),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });

    return {
      rows: rows.slice(0, input.limit).map(({ department, ...task }) => ({
        ...task,
        ...(department ? { department: department.name } : {}),
      })),
      reachedLimit: rows.length > input.limit,
    };
  }
}
