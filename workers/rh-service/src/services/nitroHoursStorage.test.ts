import type { SupabaseStorageClient } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import { SupabaseNitroHoursCertificateStorage } from "./nitroHoursStorage.js";

describe("Worker SupabaseNitroHoursCertificateStorage", () => {
  it("refuses to upload certificates when the configured bucket is public", async () => {
    const upload = vi.fn();
    const storage = new SupabaseNitroHoursCertificateStorage(
      {
        getBucket: vi.fn().mockResolvedValue({ public: true }),
        upload,
        remove: vi.fn(),
        createSignedUrl: vi.fn(),
        download: vi.fn(),
      } as unknown as SupabaseStorageClient,
      "rh-nitro-hours",
    );

    await expect(
      storage.upload({
        organizationId: "org-1",
        requestId: "request-1",
        file: { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(upload).not.toHaveBeenCalled();
  });
});
