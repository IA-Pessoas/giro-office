import { describe, expect, it, vi } from "vitest";

import { ReportJobRepository } from "../prisma/reportJobRepository.js";

type ReportJobFixture = {
  id: string;
  organization_id: string;
  requester_id: string;
  status: string;
  requested_at: Date;
  started_at: Date | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
};

function createPrisma(job: ReportJobFixture) {
  let claimed = false;
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
    $transaction: vi.fn(
      async (callback: (transaction: { $queryRaw: typeof queryRaw }) => unknown) =>
        callback({ $queryRaw: queryRaw }),
    ),
  };

  return { prisma, queryRaw };
}

describe("ReportJobRepository.claimNext", () => {
  it("claims one queued job across concurrent workers with a new lease token", async () => {
    const { prisma, queryRaw } = createPrisma({
      id: "job-1",
      organization_id: "org-1",
      requester_id: "user-1",
      status: "queued",
      requested_at: new Date("2026-08-19T12:00:00.000Z"),
      started_at: null,
      lease_token: null,
      lease_expires_at: null,
    });
    const repository = new ReportJobRepository(prisma as never, 120);

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

  it("reclaims an expired lease without replacing its original start time", async () => {
    const originalStartedAt = new Date("2026-08-19T11:00:00.000Z");
    const { prisma, queryRaw } = createPrisma({
      id: "job-2",
      organization_id: "org-1",
      requester_id: "user-1",
      status: "processing",
      requested_at: new Date("2026-08-19T10:00:00.000Z"),
      started_at: originalStartedAt,
      lease_token: "expired-lease",
      lease_expires_at: new Date("2026-08-19T11:59:59.000Z"),
    });
    const repository = new ReportJobRepository(prisma as never, 120);

    const claim = await repository.claimNext();
    const sql = (queryRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?");

    expect(claim?.lease_token).not.toBe("expired-lease");
    expect(claim?.started_at).toEqual(originalStartedAt);
    expect(sql).toContain("lease_expires_at < NOW()");
    expect(sql).toContain("COALESCE(started_at, NOW())");
  });
});
