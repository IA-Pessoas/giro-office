import { describe, expect, it, vi } from "vitest";
import { SupabaseHistoryFileStorage } from "../services/historyStorageService.js";

describe("SupabaseHistoryFileStorage", () => {
  it("stores history files as private object paths instead of public URLs", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "ignored" }, error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: {
        publicUrl: "https://example.supabase.co/storage/v1/object/public/ClientHistory/file.pdf",
      },
    });
    const supabase = {
      storage: {
        from: vi.fn().mockReturnValue({ upload, getPublicUrl }),
      },
    };
    const storage = new SupabaseHistoryFileStorage(supabase as never, "ClientHistory");

    const objectPath = await storage.saveObjectPath("client-1", {
      buffer: Buffer.from("%PDF-1.7"),
      mimetype: "application/pdf",
      originalName: "doc.pdf",
    });

    expect(objectPath).toMatch(/^clients\/historys\/client-1\/\d+_doc\.pdf$/);
    expect(upload).toHaveBeenCalledWith(
      objectPath,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("creates a temporary signed URL for a stored history file", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.supabase.co/signed/history-file" },
      error: null,
    });
    const supabase = {
      storage: {
        from: vi.fn().mockReturnValue({ createSignedUrl }),
      },
    };
    const storage = new SupabaseHistoryFileStorage(supabase as never, "ClientHistory") as {
      createSignedAccessUrl(objectPath: string): Promise<string>;
    };

    const signedUrl = await storage.createSignedAccessUrl("clients/historys/client-1/doc.pdf");

    expect(signedUrl).toBe("https://example.supabase.co/signed/history-file");
    expect(createSignedUrl).toHaveBeenCalledWith("clients/historys/client-1/doc.pdf", 300);
  });
});
