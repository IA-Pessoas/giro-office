import { getTaskReportingFields, ServiceError, type TaskReportingSource } from "@workspace/shared";

type ReportingTask = Record<string, unknown> & { department?: { name: string } };
type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true | { select: { name: true } }>;
    take: number;
  }): Promise<readonly ReportingTask[]>;
};

export class TaskReportingService {
  constructor(private readonly prisma: { task: ReportingDelegate }) {}

  async extract(input: {
    organizationId: string;
    source: TaskReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
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
