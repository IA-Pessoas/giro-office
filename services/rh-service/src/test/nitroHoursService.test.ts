import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { NitroHoursService } from "../services/nitroHoursService.js";

function setup() {
  const record = {
    id: "a1000000-0000-4000-8000-000000000001",
    organization_id: "org-1",
    user_id: "user-1",
    quarter: "2026-Q3",
    hours: 10,
    status: "Accepted",
    certificate_mime: "application/pdf",
    decided_by_id: "rh-1",
    decided_at: new Date("2026-10-01T00:00:00Z"),
    rejection_reason: null,
    created_at: new Date("2026-09-01T00:00:00Z"),
    updated_at: new Date("2026-10-01T00:00:00Z"),
    user: { id: "user-1", name: "Ana" },
  };
  const db = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: "user-1" }) },
    rhNitroHoursSubmission: {
      create: vi.fn().mockResolvedValue(record),
      findMany: vi.fn().mockResolvedValue([record]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { hours: 10 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: record.id, user_id: "other", certificate_path: "private/path" }),
      findFirstOrThrow: vi.fn().mockResolvedValue(record),
    },
    scoreQuarter: { findUnique: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  const storage = {
    upload: vi.fn().mockResolvedValue("private/path"),
    createSignedAccessUrl: vi.fn().mockResolvedValue("https://storage.invalid/signed"),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { db, storage, record };
}

describe("NitroHoursService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores submissions without returning the private storage path", async () => {
    const { db, storage, record } = setup();
    const result = await new NitroHoursService(db, storage).submit({
      organization_id: "org-1",
      user_id: "user-1",
      quarter: "2026-Q3",
      hours: 10,
      file: { buffer: Buffer.from("pdf"), mimetype: "application/pdf" },
    });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(db.rhNitroHoursSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quarter: "2026-Q3",
          hours: 10,
          certificate_path: "private/path",
        }),
      }),
    );
    expect(result).toEqual(record);
    expect(result).not.toHaveProperty("certificate_path");
  });

  it("sums only accepted hours for the exact organization, user and quarter", async () => {
    const { db, storage } = setup();
    await expect(
      new NitroHoursService(db, storage).acceptedHours({
        organization_id: "org-1",
        user_id: "user-1",
        quarter: "2026-Q3",
      }),
    ).resolves.toBe(10);
    expect(db.rhNitroHoursSubmission.aggregate).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        user_id: "user-1",
        quarter: "2026-Q3",
        status: "Accepted",
      },
      _sum: { hours: true },
    });
  });

  it("does not sign a certificate for another employee without management access", async () => {
    const { db, storage } = setup();
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

  it("does not expose a request from another organization", async () => {
    const { db, storage } = setup();
    vi.mocked(db.rhNitroHoursSubmission.findFirst).mockResolvedValue(null as never);
    await expect(
      new NitroHoursService(db, storage).certificateUrl({
        organization_id: "different-org",
        request_id: "request-1",
        user_id: "user-1",
        can_manage: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.rhNitroHoursSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1", organization_id: "different-org" },
      }),
    );
    expect(storage.createSignedAccessUrl).not.toHaveBeenCalled();
  });

  it("scopes every employee list to the caller's organization and identity", async () => {
    const { db, storage } = setup();
    await new NitroHoursService(db, storage).list({
      organization_id: "org-1",
      user_id: "user-1",
      can_manage: false,
    });
    expect(db.rhNitroHoursSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "org-1", user_id: "user-1" },
      }),
    );
  });

  it("rejects a second decision for an already-decided request", async () => {
    const { db, storage } = setup();
    vi.mocked(db.rhNitroHoursSubmission.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.rhNitroHoursSubmission.findFirst).mockResolvedValue({ id: "existing" } as never);
    await expect(
      new NitroHoursService(db, storage).decide({
        organization_id: "org-1",
        request_id: "request-1",
        actor_user_id: "rh-1",
        status: "Accepted",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("removes the private upload when creating its database record fails", async () => {
    const { db, storage } = setup();
    vi.mocked(db.rhNitroHoursSubmission.create).mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      new NitroHoursService(db, storage).submit({
        organization_id: "org-1",
        user_id: "user-1",
        quarter: "2026-Q3",
        hours: 2,
        file: { buffer: Buffer.from("pdf"), mimetype: "application/pdf" },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(storage.remove).toHaveBeenCalledWith("private/path");
  });
});
