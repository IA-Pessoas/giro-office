import { randomUUID } from "node:crypto";
import { ServiceError } from "@workspace/shared";

import { MAX_SNAPSHOT_BYTES, MAX_SNAPSHOT_ROWS } from "../schemas/reportSnapshot.schemas.js";
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

const SNAPSHOT_WRITE_CHUNK_SIZE = 500;

type ReportJob = {
  id: string;
  organization_id: string;
  report_model_version_id: string;
  status: string;
  cancel_requested_at?: Date | null;
  materialization_token?: string | null;
};

type LifecycleTransaction = ReportAuditStore & {
  reportJob: {
    findUnique(args: { where: { id: string } }): Promise<ReportJob | null>;
    updateMany(args: {
      where: {
        id: string;
        status: ReportLifecycleStatus;
        lease_token?: string;
        cancel_requested_at?: null;
        materialization_token?: string | null;
      };
      data: {
        status?: ReportLifecycleStatus;
        started_at?: Date;
        finished_at?: Date;
        materialization_token?: string | null;
      };
    }): Promise<{ count: number }>;
  };
  reportSnapshot: {
    findFirst(args: {
      where: { id: string; organization_id: string };
    }): Promise<{ id: string; report_job_id: string } | null>;
    create(args: {
      data: {
        organization_id: string;
        report_model_version_id: string;
        report_job_id: string;
        expires_at?: Date;
      };
    }): Promise<{ id: string }>;
    findMany(args: {
      where: { report_job_id: string };
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
    deleteMany(args: { where: { report_job_id?: string; id?: string } }): Promise<unknown>;
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
  reportModelVersion: {
    findFirst(args: { where: { id: string } }): Promise<{ report_model_id: string } | null>;
    deleteMany(args: { where: { report_model_id: string } }): Promise<unknown>;
  };
  reportModel: {
    findFirst(args: {
      where: { id: string; is_ephemeral: boolean; department_id?: string };
    }): Promise<{ id: string; department_id?: string } | null>;
    delete(args: { where: { id: string } }): Promise<unknown>;
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
  reason?: "retention" | "requested";
  justification?: string;
}

export interface TransitionReportJobInput extends ReportLifecycleInput {
  status: Exclude<ReportLifecycleStatus, "processing" | "completed" | "expired" | "deleted">;
  lease_token?: string;
}

export interface CompleteReportJobInput extends ReportLifecycleInput {
  lease_token: string;
  rows: ReadonlyArray<Record<string, unknown>>;
  expires_at?: Date;
}

export interface RemoveReportSnapshotInput extends ReportLifecycleInput {
  reason: "retention" | "requested";
  justification?: string;
}

export interface DeleteReportSnapshotInput extends Omit<ReportLifecycleInput, "job_id"> {
  snapshot_id: string;
  department_id: string;
  reason: "requested";
  justification: string;
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
      const leaseToken = this.leaseForProcessingTransition(
        job.status,
        input.status as ReportLifecycleStatus,
        input.lease_token,
      );

      const occurredAt = this.clock();
      const result = await transaction.reportJob.updateMany({
        where: {
          id: job.id,
          status: job.status as ReportLifecycleStatus,
          ...(leaseToken ? { lease_token: leaseToken } : {}),
        },
        data: {
          status: input.status,
          finished_at: occurredAt,
        },
      });
      this.assertUpdated(result.count);
      if (input.status === "cancelled" || input.status === "failed") {
        await this.removeEphemeralDefinition(transaction, job.report_model_version_id);
      }

      const auditEvent = this.auditEvent(job, input, `report.${input.status}`, occurredAt);
      await this.audit.recordLocal(transaction, auditEvent);
      return auditEvent;
    });

    await this.audit.recordExternal(event);
  }

  async complete(input: CompleteReportJobInput): Promise<void> {
    const snapshotRows = this.materializeSnapshotRows(input.rows);
    const snapshotBytes = this.assertSnapshotLimits(snapshotRows);
    const materializationToken = randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(transaction, input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, "completed");
      this.assertNotCancelled(job);
      const claimed = await transaction.reportJob.updateMany({
        where: {
          id: job.id,
          status: "processing",
          lease_token: input.lease_token,
          cancel_requested_at: null,
          materialization_token: null,
        },
        data: { materialization_token: materializationToken },
      });
      this.assertUpdated(claimed.count);
    });
    const event = await this.prisma.$transaction(async (transaction) => {
      const job = await this.getJob(transaction, input.job_id);
      this.assertOrganization(job, input.organization_id);
      assertTransition(job.status, "completed");
      this.assertNotCancelled(job);

      const occurredAt = this.clock();
      const snapshot = await transaction.reportSnapshot.create({
        data: {
          organization_id: job.organization_id,
          report_model_version_id: job.report_model_version_id,
          report_job_id: job.id,
          ...(input.expires_at ? { expires_at: input.expires_at } : {}),
        },
      });
      for (let start = 0; start < snapshotRows.length; start += SNAPSHOT_WRITE_CHUNK_SIZE) {
        this.assertNotCancelled(await this.getJob(transaction, input.job_id));
        await transaction.reportSnapshotRow.createMany({
          data: snapshotRows
            .slice(start, start + SNAPSHOT_WRITE_CHUNK_SIZE)
            .map((data_json, offset) => ({
              organization_id: job.organization_id,
              snapshot_id: snapshot.id,
              row_number: start + offset + 1,
              data_json,
            })),
        });
      }
      const result = await transaction.reportJob.updateMany({
        where: {
          id: job.id,
          status: "processing",
          lease_token: input.lease_token,
          cancel_requested_at: null,
          materialization_token: materializationToken,
        },
        data: {
          status: "completed",
          finished_at: occurredAt,
          materialization_token: null,
        },
      });
      this.assertUpdated(result.count);

      const auditEvent = this.auditEvent(job, input, "report.completed", occurredAt, {
        ...input.counts,
        rows: snapshotRows.length,
        bytes: snapshotBytes,
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
    if (!input.justification?.trim()) {
      throw new ServiceError(400, "A exclusão exige uma justificativa.");
    }
    await this.removeSnapshotRows(input, "deleted", "report.deleted.requested");
  }

  async deleteSnapshot(input: DeleteReportSnapshotInput): Promise<void> {
    if (!input.justification.trim()) {
      throw new ServiceError(400, "A exclusão exige uma justificativa.");
    }
    await this.removeSnapshotRows(input, "deleted", "report.deleted.requested");
  }

  private async removeSnapshotRows(
    input: RemoveReportSnapshotInput | DeleteReportSnapshotInput,
    status: "completed" | "deleted",
    eventType: Extract<
      ReportAuditEventType,
      "report.expired.retention" | "report.deleted.requested"
    >,
  ): Promise<void> {
    const event = await this.prisma.$transaction(async (transaction) => {
      const requestedSnapshot =
        "snapshot_id" in input
          ? await transaction.reportSnapshot.findFirst({
              where: { id: input.snapshot_id, organization_id: input.organization_id },
            })
          : null;
      if ("snapshot_id" in input && !requestedSnapshot) {
        throw new ServiceError(404, "Snapshot de relatório não encontrado.");
      }
      const job = await this.getJob(
        transaction,
        requestedSnapshot?.report_job_id ?? ("job_id" in input ? input.job_id : ""),
      );
      this.assertOrganization(job, input.organization_id);
      if ("snapshot_id" in input) {
        const version = await transaction.reportModelVersion.findFirst({
          where: { id: job.report_model_version_id },
        });
        const model = version
          ? await transaction.reportModel.findFirst({
              where: {
                id: version.report_model_id,
                is_ephemeral: false,
                department_id: input.department_id,
              },
            })
          : null;
        if (!model || model.department_id !== input.department_id) {
          throw new ServiceError(403, "O snapshot não pertence ao departamento atual.");
        }
      }
      const nextStatus = status === "completed" ? "expired" : "deleted";
      assertTransition(job.status, nextStatus);

      const occurredAt = this.clock();
      const result = await transaction.reportJob.updateMany({
        where: { id: job.id, status: job.status as ReportLifecycleStatus },
        data: { status: nextStatus, finished_at: occurredAt },
      });
      this.assertUpdated(result.count);
      const snapshots = requestedSnapshot
        ? [{ id: requestedSnapshot.id }]
        : await transaction.reportSnapshot.findMany({
            where: { report_job_id: job.id },
            select: { id: true },
          });
      if (snapshots.length > 0) {
        await transaction.reportSnapshotRow.deleteMany({
          where: { snapshot_id: { in: snapshots.map((snapshot) => snapshot.id) } },
        });
      }
      await transaction.reportSnapshot.deleteMany(
        requestedSnapshot
          ? { where: { id: requestedSnapshot.id } }
          : { where: { report_job_id: job.id } },
      );
      await this.removeEphemeralDefinition(transaction, job.report_model_version_id);

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

  private async removeEphemeralDefinition(
    transaction: LifecycleTransaction,
    reportModelVersionId: string,
  ): Promise<void> {
    const version = await transaction.reportModelVersion.findFirst({
      where: { id: reportModelVersionId },
    });
    if (!version) return;
    const model = await transaction.reportModel.findFirst({
      where: { id: version.report_model_id, is_ephemeral: true },
    });
    if (!model) return;
    await transaction.reportModelVersion.deleteMany({ where: { report_model_id: model.id } });
    await transaction.reportModel.delete({ where: { id: model.id } });
  }

  private assertOrganization(job: ReportJob, organizationId: string): void {
    if (job.organization_id !== organizationId) {
      throw new ServiceError(403, "O job não pertence à organização informada.");
    }
  }

  private assertNotCancelled(job: ReportJob): void {
    if (job.cancel_requested_at) {
      throw new ServiceError(409, "O cancelamento do job foi solicitado.");
    }
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new ServiceError(409, "O job foi alterado por outra operação.");
    }
  }

  private materializeSnapshotRows(
    rows: ReadonlyArray<Record<string, unknown>>,
  ): ReadonlyArray<Record<string, unknown>> {
    return JSON.parse(JSON.stringify(rows)) as ReadonlyArray<Record<string, unknown>>;
  }

  private assertSnapshotLimits(rows: ReadonlyArray<Record<string, unknown>>): number {
    if (rows.length > MAX_SNAPSHOT_ROWS) {
      throw new ServiceError(400, "O snapshot excede o limite de linhas.");
    }

    const byteSize = Buffer.byteLength(JSON.stringify(rows), "utf8");
    if (byteSize > MAX_SNAPSHOT_BYTES) {
      throw new ServiceError(400, "O snapshot excede o limite de bytes.");
    }

    return byteSize;
  }

  private leaseForProcessingTransition(
    currentStatus: string,
    nextStatus: ReportLifecycleStatus,
    leaseToken?: string,
  ): string | undefined {
    if (currentStatus === "queued" && nextStatus === "processing") {
      throw new ServiceError(409, "O claim atômico é o único caminho para iniciar processamento.");
    }
    if (currentStatus !== "processing") return undefined;
    if (!leaseToken) {
      throw new ServiceError(400, "A transição de um job em processamento exige lease_token.");
    }
    return leaseToken;
  }

  private auditEvent(
    job: ReportJob,
    input: Omit<ReportLifecycleInput, "job_id">,
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
      justification_provided: input.reason === "requested" && Boolean(input.justification?.trim()),
    });
  }
}
