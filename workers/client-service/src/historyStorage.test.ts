import { describe, expect, it, vi } from "vitest";
import { WorkerHistoryStorage } from "./historyStorage.js";

describe("WorkerHistoryStorage", () => {
  it("validates signature, keeps the bucket private and supports upload/download/remove/signed URL", async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ public: false }),
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(new Response("file")),
      remove: vi.fn().mockResolvedValue(undefined),
      createSignedUrl: vi.fn().mockResolvedValue("https://storage.test/signed/file"),
    };
    const adapter = new WorkerHistoryStorage(storage, "ClientHistory");
    const file = new File(["%PDF-1.7\ncontent"], "contrato.pdf", { type: "application/pdf" });

    const objectPath = await adapter.upload("client-1", file);
    expect(objectPath).toMatch(/^clients\/historys\/client-1\/[0-9a-f-]+_contrato\.pdf$/u);
    expect(storage.upload).toHaveBeenCalledWith(
      "ClientHistory",
      objectPath,
      file,
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    );
    expect(await adapter.createSignedAccessUrl(objectPath)).toBe(
      "https://storage.test/signed/file",
    );
    expect(await adapter.download(objectPath)).toBeInstanceOf(Response);
    await adapter.remove(objectPath);
    expect(storage.remove).toHaveBeenCalledWith("ClientHistory", objectPath);
  });

  it("rejects a public bucket and spoofed file signatures", async () => {
    const storage = {
      getBucket: vi.fn().mockResolvedValue({ public: true }),
      upload: vi.fn(),
      download: vi.fn(),
      remove: vi.fn(),
      createSignedUrl: vi.fn(),
    };
    const adapter = new WorkerHistoryStorage(storage, "ClientHistory");
    const spoofed = new File(["not a pdf"], "payload.pdf", { type: "application/pdf" });

    await expect(adapter.upload("client-1", spoofed)).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      adapter.createSignedAccessUrl("clients/historys/client-1/payload.pdf"),
    ).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
