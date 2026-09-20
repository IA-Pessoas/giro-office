import { describe, expect, it, vi } from "vitest";

import {
  buildRhPointAdjustmentObjectPath,
  isRhPointAdjustmentObjectPath,
  SupabaseRhPointAdjustmentStorage,
  UnavailableRhPointAdjustmentStorage,
} from "../services/rhPointAdjustmentStorage.js";

describe("rhPointAdjustmentStorage", () => {
  const organizationId = "00000000-0000-4000-8000-000000000002";
  const requestId = "00000000-0000-4000-8000-000000000010";
  const fileId = "00000000-0000-4000-8000-000000000011";

  it("gera chave privada previsivel e valida somente o escopo da solicitacao", () => {
    const path = buildRhPointAdjustmentObjectPath({
      organizationId,
      requestId,
      fileId,
      mimetype: "application/pdf",
    });

    expect(path).toBe(
      `rh/organizations/${organizationId}/point-adjustments/${requestId}/${fileId}.pdf`,
    );
    expect(isRhPointAdjustmentObjectPath(path, organizationId, requestId)).toBe(true);
    expect(isRhPointAdjustmentObjectPath(path, organizationId, "other-request")).toBe(false);
  });

  it("faz upload e gera URL assinada com expiracao curta", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.test/signed" },
      error: null,
    });
    const supabase = {
      storage: {
        from: vi.fn().mockReturnValue({ upload, createSignedUrl }),
      },
    };
    const storage = new SupabaseRhPointAdjustmentStorage(
      supabase as never,
      "rh-point-adjustments",
      () => fileId,
    );

    const path = await storage.upload({
      organizationId,
      requestId,
      file: { buffer: Buffer.from("pdf"), mimetype: "application/pdf" },
    });
    const signedUrl = await storage.createSignedAccessUrl(path);

    expect(upload).toHaveBeenCalledWith(path, expect.any(Buffer), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(path, 300);
    expect(signedUrl).toBe("https://storage.test/signed");
  });

  it("falha explicitamente quando o armazenamento nao esta configurado", async () => {
    const storage = new UnavailableRhPointAdjustmentStorage();

    await expect(
      storage.upload({
        organizationId,
        requestId,
        file: { buffer: Buffer.from("pdf"), mimetype: "application/pdf" },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
