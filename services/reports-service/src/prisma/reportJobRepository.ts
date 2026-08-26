import { randomUUID } from "node:crypto";

import {
  createReportAuditEvent,
  type ReportAuditService,
  type ReportAuditStore,
} from "../services/reportAuditService.js";
import {
  REPORT_LIFECYCLE_STATUSES,
  REPORT_LIFECYCLE_TRANSITIONS,
} from "../services/reportLifecycleService.js";
import type { ReportsPrismaClient } from "./index.js";

export type ClaimedReportJob = {
  id: string;
  organization_id: string;
  requester_id: string;
  report_model_version_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  payload_json: unknown;
};

const QUEUED = REPORT_LIFECYCLE_STATUSES[0];
const PROCESSING = REPORT_LIFECYCLE_TRANSITIONS.queued[0];

export class ReportJobRepository {
  constructor(
    private readonly prisma: ReportsPrismaClient,
    private readonly leaseSeconds: number,
    private readonly audit: ReportAuditService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async claimNext(): Promise<ClaimedReportJob | null> {
    const leaseToken = randomUUID();
    const claim = await this.prisma.$transaction(async (transaction) => {
      const [job] = await transaction.$queryRaw<ClaimedReportJob[]>`
        WITH candidate AS (
          SELECT id
          FROM "reports.jobs"
          WHERE status = ${QUEUED}
            OR (status = ${PROCESSING} AND lease_expires_at < NOW())
          ORDER BY requested_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "reports.jobs" AS job
        SET status = ${PROCESSING},
            lease_token = ${leaseToken},
            lease_expires_at = NOW() + (${this.leaseSeconds} * INTERVAL '1 second'),
            materialization_token = NULL,
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING
          job.id,
          job.organization_id,
          job.requester_id,
          job.report_model_version_id,
          job.status,
          job.requested_at,
          job.started_at,
          job.lease_token,
          job.lease_expires_at,
          job.payload_json
        `;
      if (!job) return { job: null, event: null };

      const event = createReportAuditEvent({
        actor_id: job.requester_id,
        organization_id: job.organization_id,
        job_id: job.id,
        report_model_version_id: job.report_model_version_id,
        event_type: "report.processing",
        occurred_at: this.clock(),
      });
      await this.audit.recordLocal(transaction as unknown as ReportAuditStore, event);
      return { job, event };
    });

    if (claim.event) await this.audit.recordExternal(claim.event);

    return claim.job;
  }

  async renewLease(input: { id: string; leaseToken: string }): Promise<boolean> {
    const updated = await this.prisma.reportJob.updateMany({
      where: {
        id: input.id,
        status: PROCESSING,
        lease_token: input.leaseToken,
        cancel_requested_at: null,
      },
      data: { lease_expires_at: new Date(Date.now() + this.leaseSeconds * 1000) },
    });
    return updated.count === 1;
  }
}
