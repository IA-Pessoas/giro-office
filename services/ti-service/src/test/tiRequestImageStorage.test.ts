import { describe, expect, it, vi } from "vitest";

import {
  buildTiRequestImageObjectPath,
  SupabaseTiRequestImageStorage,
} from "../services/tiRequestImageStorage.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const requestId = "30000000-0000-4000-8000-000000000001";

describe("TI request image storage", () => {
  it("builds an organization and request scoped object path with the MIME-derived extension", () => {
    const objectPath = buildTiRequestImageObjectPath({
      organizationId,
      requestId,
      fileId: "image-1",
      mimetype: "image/webp",
    });

    expect(objectPath).toBe(
      "ti/organizations/10000000-0000-4000-8000-000000000001/requests/30000000-0000-4000-8000-000000000001/image-1.webp",
    );
  });

  it("persists the private object path instead of a public storage URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://storage.example/ti/request-image.png" },
    });
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });
    const storage = new SupabaseTiRequestImageStorage(
      { storage: { from } } as never,
      "Fotos",
      () => "image-1",
    );

    const result = await storage.upload({
      organizationId,
      requestId,
      file: {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimetype: "image/png",
      },
    });

    expect(result).toBe(
      "ti/organizations/10000000-0000-4000-8000-000000000001/requests/30000000-0000-4000-8000-000000000001/image-1.png",
    );
    expect(upload).toHaveBeenCalledWith(
      "ti/organizations/10000000-0000-4000-8000-000000000001/requests/30000000-0000-4000-8000-000000000001/image-1.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { contentType: "image/png", upsert: false },
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("creates a five-minute signed URL only when the authorized route requests it", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed/request-image.png" },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const storage = new SupabaseTiRequestImageStorage(
      { storage: { from } } as never,
      "ti-request-attachments-private",
    );
    const objectPath =
      "ti/organizations/10000000-0000-4000-8000-000000000001/requests/30000000-0000-4000-8000-000000000001/image-1.png";

    await expect(storage.createSignedAccessUrl(objectPath)).resolves.toBe(
      "https://storage.example/signed/request-image.png",
    );
    expect(createSignedUrl).toHaveBeenCalledWith(objectPath, 300);
  });

  it("maps Supabase upload failures to an internal service error", async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error("bucket unavailable") });
    const from = vi.fn().mockReturnValue({ upload });
    const storage = new SupabaseTiRequestImageStorage(
      { storage: { from } } as never,
      "Fotos",
      () => "image-1",
    );

    await expect(
      storage.upload({
        organizationId,
        requestId,
        file: { buffer: Buffer.from([0xff, 0xd8, 0xff]), mimetype: "image/jpeg" },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Erro ao armazenar imagem do chamado de TI.",
    });
  });
});
