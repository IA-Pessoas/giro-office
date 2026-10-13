import { describe, expect, it, vi } from "vitest";

import { SupabaseProspectingAttachmentStorage } from "../integrations/prospectingAttachmentStorage.js";

function createSupabaseMock(isPublic = false) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/signed" },
    error: null,
  });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ upload, createSignedUrl, remove }));
  const getBucket = vi.fn().mockResolvedValue({ data: { public: isPublic }, error: null });
  return { storage: { from, getBucket }, upload, createSignedUrl, remove, from, getBucket };
}

describe("SupabaseProspectingAttachmentStorage", () => {
  it("stores objects in an organization and prospecting scoped private path", async () => {
    const supabase = createSupabaseMock();
    const storage = new SupabaseProspectingAttachmentStorage(
      supabase as never,
      "CommercialProspectingPrivate",
      () => "attachment-id",
    );

    await expect(
      storage.upload({
        organizationId: "org-1",
        prospectingId: "prospecting-1",
        file: { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" },
      }),
    ).resolves.toBe("comercial/organizations/org-1/prospecting/prospecting-1/attachment-id.pdf");
    expect(supabase.upload).toHaveBeenCalledWith(
      "comercial/organizations/org-1/prospecting/prospecting-1/attachment-id.pdf",
      expect.any(Buffer),
      { contentType: "application/pdf", upsert: false },
    );
  });

  it("only issues short lived links from a verified private bucket", async () => {
    const supabase = createSupabaseMock();
    const storage = new SupabaseProspectingAttachmentStorage(supabase as never);

    await expect(storage.createSignedAccessUrl("org/path/file.pdf")).resolves.toBe(
      "https://storage.example.test/signed",
    );
    expect(supabase.createSignedUrl).toHaveBeenCalledWith("org/path/file.pdf", 300);
  });

  it("refuses a public bucket", async () => {
    const supabase = createSupabaseMock(true);
    const storage = new SupabaseProspectingAttachmentStorage(supabase as never);

    await expect(storage.createSignedAccessUrl("org/path/file.pdf")).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });
});
