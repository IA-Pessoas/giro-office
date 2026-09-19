import { describe, expect, it, vi } from "vitest";

import {
  buildRhRequestMessageObjectPath,
  isRhRequestMessageObjectPath,
  SupabaseRhRequestMessageStorage,
  UnavailableRhRequestMessageStorage,
} from "../services/rhRequestMessageStorage.js";

describe("rhRequestMessageStorage", () => {
  const organizationId = "00000000-0000-4000-8000-000000000002";
  const requestId = "00000000-0000-4000-8000-000000000010";
  const fileId = "00000000-0000-4000-8000-000000000011";

  it("mantém o anexo no escopo da organização e da solicitação", () => {
    const path = buildRhRequestMessageObjectPath({
      organizationId,
      requestId,
      fileId,
      mimetype: "application/pdf",
    });

    expect(path).toBe(
      `rh/organizations/${organizationId}/request-messages/${requestId}/${fileId}.pdf`,
    );
    expect(isRhRequestMessageObjectPath(path, organizationId, requestId)).toBe(true);
    expect(isRhRequestMessageObjectPath(path, organizationId, "other-request")).toBe(false);
  });

  it("faz upload e assina somente os formatos aceitos", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.test/signed" },
      error: null,
    });
    const storage = new SupabaseRhRequestMessageStorage(
      { storage: { from: vi.fn().mockReturnValue({ upload, createSignedUrl }) } } as never,
      "rh-request-messages",
      () => fileId,
    );

    const path = await storage.upload({
      organizationId,
      requestId,
      file: { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" },
    });
    const signedUrl = await storage.createSignedAccessUrl(path);

    expect(upload).toHaveBeenCalledWith(path, expect.any(Buffer), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(path, 300);
    expect(signedUrl).toBe("https://storage.test/signed");
  });

  it("retorna indisponível sem configuração de armazenamento", async () => {
    const storage = new UnavailableRhRequestMessageStorage();
    await expect(
      storage.upload({
        organizationId,
        requestId,
        file: { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
