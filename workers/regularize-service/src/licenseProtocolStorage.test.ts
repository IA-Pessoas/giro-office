import type { SupabaseStorageClient } from "@workspace/runtime";
import { describe, expect, it, vi } from "vitest";
import {
  buildLicenseProtocolObjectPath,
  isLicenseProtocolObjectPath,
  parseLicenseProtocolUpload,
  WorkerLicenseProtocolStorage,
} from "./licenseProtocolStorage.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const licenseId = "c0000000-0000-4000-8000-000000000001";

describe("regularize protocol storage", () => {
  it("validates a PDF signature and builds an organization-scoped path", async () => {
    const file = await parseLicenseProtocolUpload(
      new File(["%PDF-1.7 protocol"], "protocolo.pdf", { type: "application/pdf" }),
    );
    const path = buildLicenseProtocolObjectPath({
      organizationId,
      licenseId,
      fileId: "d0000000-0000-4000-8000-000000000001",
      mimetype: file.mimetype,
    });

    expect(isLicenseProtocolObjectPath(path, organizationId, licenseId)).toBe(true);
    expect(path).toContain(`/organizations/${organizationId}/licenses/${licenseId}/protocols/`);
  });

  it("rejects a file whose content does not match the declared MIME type", async () => {
    await expect(
      parseLicenseProtocolUpload(
        new File(["not a pdf"], "protocolo.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses uploads and signed URLs from a public bucket", async () => {
    const storage: SupabaseStorageClient = {
      getBucket: vi.fn(async () => ({ public: true })),
      upload: vi.fn(),
      download: vi.fn(),
      remove: vi.fn(),
      createSignedUrl: vi.fn(),
    };
    const adapter = new WorkerLicenseProtocolStorage(storage, "protocols");
    const file = await parseLicenseProtocolUpload(
      new File(["%PDF-1.7 protocol"], "protocolo.pdf", { type: "application/pdf" }),
    );

    await expect(adapter.upload({ organizationId, licenseId, file })).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
