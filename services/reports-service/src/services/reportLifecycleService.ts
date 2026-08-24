import { ServiceError } from "@workspace/shared";

import type {
  ReportAuditEventInput,
  ReportAuditEventType,
  ReportAuditService,
  ReportAuditStore,
} from "./reportAuditService.js";
import { createReportAuditEvent } from "./reportAuditService.js";

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
    findUnique(args: { where: { id: string } }): Promise<ReportJob | null>;
    updateMany(args: {
      where: { id: string; status: ReportLifecycleStatus; lease_token?: string };
      data: { status: ReportLifecycleStatus; started_at?: Date; finished_at?: Date };
    }): Promise<{ count: number }>;
  };
  reportSnapshot: {
    create(args: {
      data: {
        organization_id: string;
        report_model_version_id: string;
        report_job_id: string;
      };
    }): Promise<{ id: string }>;
    findMany(args: {
      where: { report_job_id: string };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
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
    deleteMany(args: { where: { snapshot_id: { in: string[] } } }): Promise<unknown>;
  };
};

interface ReportLifecycleStore {
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
  lease_token?: string;
}

export interface CompleteReportJobInput extends ReportLifecycleInput {
  lease_token: string;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface RemoveReportSnapshotInput extends ReportLifecycleInput {
  reason: "retention" | "requested";
}

export const REPORT_LIFECYCLE_TRANSITIONS: Record<
  ReportLifecycleStatus,
  readonly ReportLifecycleStatus[]
> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "cancelled", "failed"],
  completed: ["expired", "deleted"],
  cancelled: [],
  failed: [],
  expired: ["deleted"],
  deleted: [],
};

function assertTransition(from: string, to: ReportLifecycleStatus): void {
  if (!REPORT_LIFECYCLE_STATUSES.includes(from as ReportLifecycleStatus)) {
    throw new ServiceError(409, "O job está em um estado de lifecycle desconhecido.");
  }
  if (!REPORT_LIFECYCLE_TRANSITIONS[from as ReportLifecycleStatus].includes(to)) {
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
      const job = await this.getJob(transaction, input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, input.status);
      const leaseToken = this.leaseForWorkerTransition(job.status, input);

      const occurredAt = this.clock();
      const result = await transaction.reportJob.updateMany({
        where: {
          id: job.id,
          status: job.status as ReportLifecycleStatus,
          ...(leaseToken ? { lease_token: leaseToken } : {}),
        },
        data: {
          status: input.status,
          ...(input.status === "processing"
            ? { started_at: occurredAt }
            : { finished_at: occurredAt }),
        },
      });
      this.assertUpdated(result.count);

      const auditEvent = this.auditEvent(job, input, `report.${input.status}`, occurredAt);
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  async complete(input: CompleteReportJobInput): Promise<void> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(transaction, input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, "completed");

      const occurredAt = this.clock();
      const result = await transaction.reportJob.updateMany({
        where: { id: job.id, status: "processing", lease_token: input.lease_token },
        data: { status: "completed", finished_at: occurredAt },
      });
      this.assertUpdated(result.count);
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
      const job = await this.getJob(transaction, input.job_id);
      this.assertOrganization(job, input.organization_id);
      const nextStatus = status === "completed" ? "expired" : "deleted";
      assertTransition(job.status, nextStatus);

      const occurredAt = this.clock();
      const result = await transaction.reportJob.updateMany({
        where: { id: job.id, status: job.status as ReportLifecycleStatus },
        data: { status: nextStatus, finished_at: occurredAt },
      });
      this.assertUpdated(result.count);
      const snapshots = await transaction.reportSnapshot.findMany({
        where: { report_job_id: job.id },
        select: { id: true },
      });
      if (snapshots.length > 0) {
        await transaction.reportSnapshotRow.deleteMany({
          where: { snapshot_id: { in: snapshots.map((snapshot) => snapshot.id) } },
        });
      }

      const auditEvent = this.auditEvent(job, input, eventType, occurredAt);
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  private async getJob(transaction: LifecycleTransaction, jobId: string): Promise<ReportJob> {
    const job = await transaction.reportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new ServiceError(404, "Job de relatório não encontrado.");
    return job;
  }

  private assertOrganization(job: ReportJob, organizationId: string): void {
    if (job.organization_id !== organizationId) {
      throw new ServiceError(403, "O job não pertence à organização informada.");
    }
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new ServiceError(409, "O job foi alterado por outra operação.");
    }
  }

  private leaseForWorkerTransition(
    currentStatus: string,
    input: TransitionReportJobInput,
  ): string | undefined {
    if (currentStatus !== "processing" || input.status !== "failed") return undefined;
    if (!input.lease_token) {
      throw new ServiceError(400, "A falha de um job em processamento exige lease_token.");
    }
    return input.lease_token;
  }

  private auditEvent(
    job: ReportJob,
    input: ReportLifecycleInput,
    eventType: ReportAuditEventType,
    occurredAt: Date,
    counts: ReportAuditEventInput["counts"] = input.counts,
  ): ReportAuditEventInput {
    return createReportAuditEvent({
      actor_id: input.actor_id,
      organization_id: job.organization_id,
      ...(input.department_id ? { department_id: input.department_id } : {}),
      job_id: job.id,
      report_model_version_id: job.report_model_version_id,
      event_type: eventType,
      occurred_at: occurredAt,
      counts,
    });
  }
}
