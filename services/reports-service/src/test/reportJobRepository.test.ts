import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { ReportJobRepository } from "../prisma/reportJobRepository.js";
import { ReportAuditService } from "../services/reportAuditService.js";

type ReportJobFixture = {
  id: string;
  organization_id: string;
  requester_id: string;
  report_model_version_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
};

function createPrisma(job: ReportJobFixture) {
  let claimed = false;
  const auditEventCreate = vi.fn();
  const queryRaw = vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => {
    if (claimed) return [];

    claimed = true;
    const leaseToken = values.find(
      (value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
    );
    return [
      {
        ...job,
        status: "processing",
        lease_token: leaseToken,
        lease_expires_at: new Date("2026-08-19T12:02:00.000Z"),
      },
    ];
  });
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const transaction = {
    $queryRaw: queryRaw,
    reportAuditEvent: { create: auditEventCreate },
  };

  return { prisma, queryRaw, auditEventCreate };
}

describe("ReportJobRepository.claimNext", () => {
  it("claims one queued job across concurrent workers with a new lease token", async () => {
    const { prisma, queryRaw } = createPrisma({
      id: "job-1",
      organization_id: "org-1",
      requester_id: "user-1",
      report_model_version_id: "model-version-1",
      status: "queued",
      requested_at: new Date("2026-08-19T12:00:00.000Z"),
      started_at: null,
      lease_token: null,
      lease_expires_at: null,
    });
    const repository = new ReportJobRepository(
      prisma as never,
      120,
      new ReportAuditService(prisma as never, vi.fn()),
    );

    const [first, second] = await Promise.all([repository.claimNext(), repository.claimNext()]);
    const claim = [first, second].find(Boolean);
    const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
    const values = queryRaw.mock.calls[0]?.slice(1);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(claim).toMatchObject({ id: "job-1", status: "processing" });
    expect(claim?.lease_token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("WHERE status = ?");
    expect(values).toEqual(expect.arrayContaining(["queued", "processing"]));
  });

  it("registra auditoria segura quando o claim move o job para processing", async () => {
    const { prisma, auditEventCreate } = createPrisma({
      id: "job-1",
      organization_id: "org-1",
      requester_id: "user-1",
      report_model_version_id: "model-version-1",
      status: "queued",
      requested_at: new Date("2026-08-19T12:00:00.000Z"),
      started_at: null,
      lease_token: null,
      lease_expires_at: null,
    });
    const recorder = vi.fn();
    const audit = new ReportAuditService(prisma as never, recorder);
    const repository = new ReportJobRepository(
      prisma as never,
      120,
      audit,
      () => new Date("2026-08-24T12:00:00.000Z"),
    );

    await repository.claimNext();

    expect(auditEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: "report.processing" }),
      }),
    );
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.processing",
        metadata: expect.objectContaining({
          report_job_id: "job-1",
          report_model_version_id: "model-version-1",
        }),
      }),
    );
  });

  it("reclaims an expired lease without replacing its original start time", async () => {
    const originalStartedAt = new Date("2026-08-19T11:00:00.000Z");
    const { prisma, queryRaw } = createPrisma({
      id: "job-2",
      organization_id: "org-1",
      requester_id: "user-1",
      report_model_version_id: "model-version-1",
      status: "processing",
      requested_at: new Date("2026-08-19T10:00:00.000Z"),
      started_at: originalStartedAt,
      lease_token: "expired-lease",
      lease_expires_at: new Date("2026-08-19T11:59:59.000Z"),
    });
    const repository = new ReportJobRepository(
      prisma as never,
      120,
      new ReportAuditService(prisma as never, vi.fn()),
    );

    const claim = await repository.claimNext();
    const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");

    expect(claim?.lease_token).not.toBe("expired-lease");
    expect(claim?.started_at).toEqual(originalStartedAt);
    expect(sql).toContain("lease_expires_at < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')");
    expect(sql).toContain("COALESCE(started_at, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')");
  });

  it("renova lease com relógio UTC do banco", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const repository = new ReportJobRepository(
      { $executeRaw: executeRaw } as never,
      120,
      new ReportAuditService({} as never, vi.fn()),
    );

    await expect(repository.renewLease({ id: "job-1", leaseToken: "lease-1" })).resolves.toBe(true);

    const sql = (executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");
    expect(sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
  });

  it("invalida leases em processamento durante a migração para UTC", async () => {
    const migration = await readFile(
      new URL(
        "../../../../infra/prisma/migrations/20260826110000_report_job_ephemeral_model_and_snapshot_expiry/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("WHERE status = 'processing'");
    expect(migration).toContain("lease_expires_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'");
  });
});
