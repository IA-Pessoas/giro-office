import { ServiceError } from "@workspace/shared";

import type {
  ReportAuditEventInput,
  ReportAuditEventType,
  ReportAuditService,
  ReportAuditStore,
} from "./reportAuditService.js";

export const REPORT_LIFECYCLE_STATUSES = [
  "queued",
  "processing",
  "completed",
  "cancelled",
  "failed",
  "expired",
  "deleted",
] as const;

export type ReportLifecycleStatus = (typeof REPORT_LIFECYCLE_STATUSES)[number];

type ReportJob = {
  id: string;
  organization_id: string;
  report_model_version_id: string;
  status: string;
};

type LifecycleTransaction = ReportAuditStore & {
  reportJob: {
    update(args: {
      where: { id: string };
      data: { status: ReportLifecycleStatus; started_at?: Date; finished_at?: Date };
    }): Promise<unknown>;
  };
  reportSnapshot: {
    create(args: {
      data: {
        organization_id: string;
        report_model_version_id: string;
        report_job_id: string;
      };
    }): Promise<{ id: string }>;
  };
  reportSnapshotRow: {
    createMany(args: {
      data: Array<{
        organization_id: string;
        snapshot_id: string;
        row_number: number;
        data_json: Record<string, unknown>;
      }>;
    }): Promise<unknown>;
    deleteMany(args: { where: { snapshot: { report_job_id: string } } }): Promise<unknown>;
  };
};

interface ReportLifecycleStore {
  reportJob: {
    findUnique(args: { where: { id: string } }): Promise<ReportJob | null>;
  };
  $transaction<T>(callback: (transaction: LifecycleTransaction) => Promise<T>): Promise<T>;
}

interface ReportLifecycleInput {
  job_id: string;
  organization_id: string;
  actor_id: string;
  department_id?: string;
  counts?: ReportAuditEventInput["counts"];
}

export interface TransitionReportJobInput extends ReportLifecycleInput {
  status: Exclude<ReportLifecycleStatus, "completed" | "expired" | "deleted">;
}

export interface CompleteReportJobInput extends ReportLifecycleInput {
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface RemoveReportSnapshotInput extends ReportLifecycleInput {
  reason: "retention" | "requested";
}

const ALLOWED_TRANSITIONS: Record<ReportLifecycleStatus, readonly ReportLifecycleStatus[]> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "cancelled", "failed"],
  completed: [],
  cancelled: [],
  failed: [],
  expired: [],
  deleted: [],
};

function assertTransition(from: string, to: ReportLifecycleStatus): void {
  if (!REPORT_LIFECYCLE_STATUSES.includes(from as ReportLifecycleStatus)) {
    throw new ServiceError(409, "O job está em um estado de lifecycle desconhecido.");
  }
  if (!ALLOWED_TRANSITIONS[from as ReportLifecycleStatus].includes(to)) {
    throw new ServiceError(409, "A transição de lifecycle do job não é permitida.");
  }
}

export class ReportLifecycleService {
  constructor(
    private readonly prisma: ReportLifecycleStore,
    private readonly audit: ReportAuditService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async transition(input: TransitionReportJobInput): Promise<void> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, input.status);

      const occurredAt = this.clock();
      await transaction.reportJob.update({
        where: { id: job.id },
        data: {
          status: input.status,
          ...(input.status === "processing"
            ? { started_at: occurredAt }
            : { finished_at: occurredAt }),
        },
      });

      const auditEvent = this.auditEvent(job, input, `report.${input.status}`, occurredAt);
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  async complete(input: CompleteReportJobInput): Promise<void> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, "completed");

      const occurredAt = this.clock();
      await transaction.reportJob.update({
        where: { id: job.id },
        data: { status: "completed", finished_at: occurredAt },
      });
      const snapshot = await transaction.reportSnapshot.create({
        data: {
          organization_id: job.organization_id,
          report_model_version_id: job.report_model_version_id,
          report_job_id: job.id,
        },
      });
      await transaction.reportSnapshotRow.createMany({
        data: input.rows.map((data_json, index) => ({
          organization_id: job.organization_id,
          snapshot_id: snapshot.id,
          row_number: index + 1,
          data_json,
        })),
      });

      const auditEvent = this.auditEvent(job, input, "report.completed", occurredAt, {
        rows: input.rows.length,
        ...input.counts,
      });
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  async expire(input: RemoveReportSnapshotInput): Promise<void> {
    if (input.reason !== "retention") {
      throw new ServiceError(400, "A expiração exige a justificativa de retenção.");
    }
    await this.removeSnapshotRows(input, "completed", "report.expired.retention");
  }

  async delete(input: RemoveReportSnapshotInput): Promise<void> {
    if (input.reason !== "requested") {
      throw new ServiceError(400, "A exclusão exige a justificativa de solicitação.");
    }
    await this.removeSnapshotRows(input, "deleted", "report.deleted.requested");
  }

  private async removeSnapshotRows(
    input: RemoveReportSnapshotInput,
    status: "completed" | "deleted",
    eventType: Extract<
      ReportAuditEventType,
      "report.expired.retention" | "report.deleted.requested"
    >,
  ): Promise<void> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(input.job_id);
      this.assertOrganization(job, input.organization_id);
      if (job.status !== "completed" && (status !== "deleted" || job.status !== "expired")) {
        throw new ServiceError(409, "Somente snapshots concluídos podem ser removidos.");
      }

      const occurredAt = this.clock();
      await transaction.reportSnapshotRow.deleteMany({
        where: { snapshot: { report_job_id: job.id } },
      });
      await transaction.reportJob.update({
        where: { id: job.id },
        data: { status: status === "completed" ? "expired" : "deleted", finished_at: occurredAt },
      });

      const auditEvent = this.auditEvent(job, input, eventType, occurredAt);
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  private async getJob(jobId: string): Promise<ReportJob> {
    const job = await this.prisma.reportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
    return job;
  }

  private assertOrganization(job: ReportJob, organizationId: string): void {
    if (job.organization_id !== organizationId) {
      throw new ServiceError(403, "O job não pertence à organização informada.");
    }
  }

  private auditEvent(
    job: ReportJob,
    input: ReportLifecycleInput,
    eventType: ReportAuditEventType,
    occurredAt: Date,
    counts: ReportAuditEventInput["counts"] = input.counts,
  ): ReportAuditEventInput {
    return {
      actor_id: input.actor_id,
      organization_id: job.organization_id,
      ...(input.department_id ? { department_id: input.department_id } : {}),
      job_id: job.id,
      report_model_version_id: job.report_model_version_id,
      event_type: eventType,
      occurred_at: occurredAt,
      counts,
    };
  }
}
