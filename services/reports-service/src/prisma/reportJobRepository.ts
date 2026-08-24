import { randomUUID } from "node:crypto";

import {
  REPORT_LIFECYCLE_STATUSES,
  REPORT_LIFECYCLE_TRANSITIONS,
} from "../services/reportLifecycleService.js";
import type { ReportsPrismaClient } from "./index.js";

export type ClaimedReportJob = {
  id: string;
  organization_id: string;
  requester_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
};

const QUEUED = REPORT_LIFECYCLE_STATUSES[0];
const PROCESSING = REPORT_LIFECYCLE_TRANSITIONS.queued[0];

export class ReportJobRepository {
  constructor(
    private readonly prisma: ReportsPrismaClient,
    private readonly leaseSeconds: number,
  ) {}

  async claimNext(): Promise<ClaimedReportJob | null> {
    const leaseToken = randomUUID();
    const [job] = await this.prisma.$transaction(
      (transaction) =>
        transaction.$queryRaw<ClaimedReportJob[]>`
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
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING
          job.id,
          job.organization_id,
          job.requester_id,
          job.status,
          job.requested_at,
          job.started_at,
          job.lease_token,
          job.lease_expires_at
        `,
    );

    return job ?? null;
  }
}
