import { describe, expect, it, vi } from "vitest";

import {
  SupabaseLicenseProtocolStorage,
  validateLicenseProtocolUploadFile,
} from "../services/licenseProtocolStorage.js";

describe("SupabaseLicenseProtocolStorage", () => {
  it("usa bucket privado sem gerar URL pública", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn();
    const supabase = {
      storage: {
        getBucket: vi.fn().mockResolvedValue({ data: { public: false }, error: null }),
        from: vi.fn().mockReturnValue({ upload, getPublicUrl }),
      },
    };
    const storage = new SupabaseLicenseProtocolStorage(
      supabase as never,
      "regularize-license-protocols",
      () => "10000000-0000-4000-8000-000000000001",
    );

    const objectPath = await storage.upload({
      organizationId: "org-1",
      licenseId: "license-1",
      file: {
        buffer: Buffer.from("%PDF-1.7"),
        mimetype: "application/pdf",
        originalname: "protocolo.pdf",
        size: 8,
      },
    });

    expect(objectPath).toBe(
      "regularize/organizations/org-1/licenses/license-1/protocols/10000000-0000-4000-8000-000000000001.pdf",
    );
    expect(upload).toHaveBeenCalledWith(objectPath, expect.any(Buffer), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("recusa bucket público antes do upload", async () => {
    const upload = vi.fn();
    const supabase = {
      storage: {
        getBucket: vi.fn().mockResolvedValue({ data: { public: true }, error: null }),
        from: vi.fn().mockReturnValue({ upload }),
      },
    };
    const storage = new SupabaseLicenseProtocolStorage(supabase as never, "public-bucket");

    await expect(
      storage.upload({
        organizationId: "org-1",
        licenseId: "license-1",
        file: {
          buffer: Buffer.from("%PDF-1.7"),
          mimetype: "application/pdf",
          originalname: "protocolo.pdf",
          size: 8,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(upload).not.toHaveBeenCalled();
  });

  it("valida formato, extensão e assinatura do arquivo", () => {
    expect(() =>
      validateLicenseProtocolUploadFile({
        buffer: Buffer.from("not-a-pdf"),
        mimetype: "application/pdf",
        originalname: "protocolo.pdf",
        size: 9,
      }),
    ).toThrow("Assinatura do arquivo");

    expect(() =>
      validateLicenseProtocolUploadFile({
        buffer: Buffer.from("%PDF-1.7"),
        mimetype: "application/pdf",
        originalname: "protocolo.png",
        size: 8,
      }),
    ).toThrow("Extensão do protocolo");
  });
});
