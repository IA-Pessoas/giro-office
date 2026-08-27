import { randomUUID } from "node:crypto";

import {
  type AuditRecorder,
  createAuditRecorder,
  type Logger,
  ServiceError,
} from "@workspace/shared";

export const REPORT_AUDIT_EVENT_TYPES = [
  "report.model",
  "report.job",
  "report.open",
  "report.export",
  "report.retention",
  "report.delete",
  "report.queued",
  "report.processing",
  "report.completed",
  "report.cancelled",
  "report.failed",
  "report.expired.retention",
  "report.deleted.requested",
] as const;

export type ReportAuditEventType = (typeof REPORT_AUDIT_EVENT_TYPES)[number];

export interface ReportAuditEventInput {
  actor_id: string;
  organization_id: string;
  department_id?: string;
  job_id?: string;
  report_model_version_id?: string;
  event_type: ReportAuditEventType;
  occurred_at: Date;
  format?: "csv" | "xlsx";
  result?: "success" | "failure";
  counts?: {
    rows?: number;
    bytes?: number;
  };
}

export function createReportAuditEvent(input: ReportAuditEventInput): ReportAuditEventInput {
  return {
    actor_id: input.actor_id,
    organization_id: input.organization_id,
    ...(input.department_id ? { department_id: input.department_id } : {}),
    job_id: input.job_id,
    report_model_version_id: input.report_model_version_id,
    event_type: input.event_type,
    occurred_at: input.occurred_at,
    ...(input.format ? { format: input.format } : {}),
    ...(input.result ? { result: input.result } : {}),
    ...(input.counts ? { counts: input.counts } : {}),
  };
}

export interface ReportAuditStore {
  reportAuditEvent: {
    create(args: {
      data: {
        organization_id: string;
        report_job_id?: string;
        actor_id: string;
        event_type: ReportAuditEventType;
        payload_json: Record<string, unknown>;
      };
    }): Promise<unknown>;
  };
}

interface CreateReportAuditServiceOptions {
  enabled: boolean;
  serviceUrl: string;
  serviceToken: string;
  logger: Logger;
}

function safeCounts(counts: ReportAuditEventInput["counts"]): Record<string, number> {
  const entries = Object.entries(counts ?? {}).filter(
    ([, value]) => Number.isSafeInteger(value) && value >= 0,
  ) as [string, number][];

  if (entries.length !== Object.keys(counts ?? {}).length) {
    throw new ServiceError(400, "As contagens de auditoria devem ser inteiros não negativos.");
  }

  return Object.fromEntries(entries);
}

function metadata(input: ReportAuditEventInput): Record<string, unknown> {
  return {
    ...(input.department_id ? { department_id: input.department_id } : {}),
    ...(input.job_id ? { report_job_id: input.job_id } : {}),
    ...(input.report_model_version_id
      ? { report_model_version_id: input.report_model_version_id }
      : {}),
    event_type: input.event_type,
    occurred_at: input.occurred_at.toISOString(),
    ...(input.format ? { format: input.format } : {}),
    ...(input.result ? { result: input.result } : {}),
    counts: safeCounts(input.counts),
  };
}

export class ReportAuditService {
  constructor(
    private readonly prisma: ReportAuditStore,
    private readonly recordAudit: AuditRecorder,
  ) {}

  async recordLocal(store: ReportAuditStore, input: ReportAuditEventInput): Promise<void> {
    const payload = metadata(input);
    await store.reportAuditEvent.create({
      data: {
        organization_id: input.organization_id,
        ...(input.job_id ? { report_job_id: input.job_id } : {}),
        actor_id: input.actor_id,
        event_type: input.event_type,
        payload_json: Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== "report_job_id"),
        ),
      },
    });
  }

  async recordExternal(input: ReportAuditEventInput): Promise<void> {
    const auditMetadata = metadata(input);
    await this.recordAudit({
      requestId: randomUUID(),
      organizationId: input.organization_id,
      userId: input.actor_id,
      method: "REPORT_LIFECYCLE",
      path: input.job_id ? `/reports/jobs/${input.job_id}` : "/reports/snapshots/export",
      outcome: input.result === "failure" ? "error" : "success",
      serviceSource: "reports-service",
      createdAt: input.occurred_at.toISOString(),
      finishedAt: input.occurred_at.toISOString(),
      action: input.event_type,
      referring: "reports.job",
      referringId: input.job_id ?? null,
      department: input.department_id ?? null,
      metadata: auditMetadata,
    });
  }

  async record(input: ReportAuditEventInput): Promise<void> {
    await this.recordLocal(this.prisma, input);
    await this.recordExternal(input);
  }
}

export function createReportAuditService(
  prisma: ReportAuditStore,
  options: CreateReportAuditServiceOptions,
): ReportAuditService {
  return new ReportAuditService(prisma, createAuditRecorder(options));
}
