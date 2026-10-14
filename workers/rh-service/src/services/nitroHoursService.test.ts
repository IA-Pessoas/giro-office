import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { NitroHoursService } from "./nitroHoursService.js";

function setup() {
  const submission = {
    id: "a1000000-0000-4000-8000-000000000001",
    organization_id: "org-1",
    user_id: "user-1",
    quarter: "2026-Q3",
    hours: 10,
    status: "Accepted",
    certificate_mime: "application/pdf",
    decided_by_id: null,
    decided_at: null,
    rejection_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    user: { id: "user-1", name: "Ana" },
  };
  const db = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: "user-1" }) },
    rhNitroHoursSubmission: {
      create: vi.fn().mockResolvedValue(submission),
      findMany: vi.fn().mockResolvedValue([submission]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { hours: 10 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn().mockResolvedValue(submission),
    },
    scoreQuarter: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  const storage = {
    upload: vi.fn().mockResolvedValue("private/path"),
    createSignedAccessUrl: vi.fn().mockResolvedValue("https://storage.invalid/signed"),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { db, storage, submission };
}

describe("Worker NitroHoursService", () => {
  it("uses organization-scoped accepted-hour totals", async () => {
    const { db, storage } = setup();
    const result = await new NitroHoursService(db, storage).acceptedHours({
      organization_id: "org-1",
      user_id: "user-1",
      quarter: "2026-Q3",
    });
    expect(result).toBe(10);
    expect(db.rhNitroHoursSubmission.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          quarter: "2026-Q3",
          status: "Accepted",
        }),
      }),
    );
  });

  it("returns an accepted submission and updates an eligible quarter bonus", async () => {
    const { db, storage, submission } = setup();
    const result = await new NitroHoursService(db, storage).decide({
      organization_id: "org-1",
      request_id: submission.id,
      actor_user_id: "rh-1",
      status: "Accepted",
    });
    expect(result).toEqual(submission);
    expect(db.rhNitroHoursSubmission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: submission.id, organization_id: "org-1", status: "Pending" },
      }),
    );
  });

  it("hides certificates belonging to another employee", async () => {
    const { db, storage } = setup();
    vi.mocked(db.rhNitroHoursSubmission.findFirst).mockResolvedValue({
      user_id: "different-user",
      certificate_path: "private/path",
    } as never);
    await expect(
      new NitroHoursService(db, storage).certificateUrl({
        organization_id: "org-1",
        request_id: "request-1",
        user_id: "user-1",
        can_manage: false,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.createSignedAccessUrl).not.toHaveBeenCalled();
  });
});
