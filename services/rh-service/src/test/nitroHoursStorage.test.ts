import { describe, expect, it, vi } from "vitest";
import { SupabaseNitroHoursCertificateStorage } from "../services/nitroHoursStorage.js";

describe("SupabaseNitroHoursCertificateStorage", () => {
  it("refuses to upload certificates when the configured bucket is public", async () => {
    const upload = vi.fn();
    const getBucket = vi.fn().mockResolvedValue({ data: { public: true }, error: null });
    const storage = new SupabaseNitroHoursCertificateStorage(
      { storage: { getBucket, from: vi.fn(() => ({ upload })) } } as never,
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
