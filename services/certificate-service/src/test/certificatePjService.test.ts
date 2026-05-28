import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import { CertificatePjService } from "../services/certificatePjService.js";
import { certificateOrganizationId, certificateUserId } from "./testUtils.js";

const certificateId = "20000000-0000-4000-8000-000000000001";

function createCertificatePjRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: certificateId,
    client_castelo_status: true,
    client_focus_status: false,
    name: "Empresa Castelo",
    cnpj: "11222333000144",
    responsible: "Maria Silva",
    model: "A1",
    legal_nature: "LTDA",
    password: "secret-password",
    expiration_date: new Date("2026-12-31T00:00:00.000Z"),
    notes: "Renovar com antecedencia",
    was_paid: true,
    payment_date: new Date("2026-01-10T00:00:00.000Z"),
    payment_amount: 250,
    contact_info: "certificados@example.com",
    file_path: "/certificates/pj/empresa.pfx",
    has_certificate: true,
    organization_id: certificateOrganizationId,
    file_original_name: null,
    file_mime_type: null,
    file_size_bytes: null,
    file_sha256: null,
    file_uploaded_at: null,
    file_uploaded_by_user_id: null,
    file_storage_provider: null,
    file_storage_bucket: null,
    file_encryption_iv: null,
    file_encryption_tag: null,
    file_encryption_key_version: null,
    ...overrides,
  };
}

function createCertificateFileDeps() {
  const storedObjects = new Map<string, Buffer>();
  const storage = {
    putObject: vi.fn(async ({ path, buffer }: { path: string; buffer: Buffer }) => {
      storedObjects.set(path, buffer);
    }),
    getObject: vi.fn(async (path: string) => {
      const object = storedObjects.get(path);
      if (!object) {
        throw new Error("missing object");
      }
      return object;
    }),
    deleteObject: vi.fn(async (path: string) => {
      storedObjects.delete(path);
    }),
  };
  const crypto = createCertificateFileCrypto({
    keyBase64: Buffer.alloc(32, 7).toString("base64"),
    keyVersion: "v1",
  });

  return { storage, crypto, storedObjects };
}

describe("CertificatePjService", () => {
  it("listCertificatePj filters by organization_id and never selects password", async () => {
    const prisma = {
      certificatePJ: {
        findMany: vi.fn(async () => [createCertificatePjRecord()]),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.listCertificatePj({
      organizationId: certificateOrganizationId,
      query: { has_certificate: true, page: 2, page_size: 25 },
    });

    expect(prisma.certificatePJ.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        has_certificate: true,
      },
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      skip: 25,
      take: 25,
      select: expect.not.objectContaining({ password: true }),
    });
    expect(result[0]).not.toHaveProperty("password");
  });

  it("getCertificatePj returns password when canViewPassword is true", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => createCertificatePjRecord()),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.getCertificatePj({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: true,
    });

    expect(result.password).toBe("secret-password");
  });

  it("getCertificatePj removes password when canViewPassword is false", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => createCertificatePjRecord()),
      },
    };
    const service = new CertificatePjService(prisma as never);

    const result = await service.getCertificatePj({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: false,
    });

    expect(result).not.toHaveProperty("password");
  });

  it("createCertificatePj blocks duplicates by organization_id, name, cnpj and model", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => ({ id: certificateId })),
        create: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.createCertificatePj({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Empresa Castelo",
          cnpj: "11222333000144",
          responsible: "Maria Silva",
          model: "A1",
          legal_nature: "LTDA",
          password: "secret-password",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          was_paid: true,
          has_certificate: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        model: "A1",
      },
    });
    expect(prisma.certificatePJ.create).not.toHaveBeenCalled();
  });

  it("createCertificatePj maps database unique violations to conflict", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw { code: "P2002" };
        }),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.createCertificatePj({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Empresa Castelo",
          cnpj: "11222333000144",
          responsible: "Maria Silva",
          model: "A1",
          legal_nature: "LTDA",
          password: "secret-password",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          was_paid: true,
          has_certificate: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
  });

  it("updateCertificatePj returns 404 when record does not exist in organization", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.updateCertificatePj({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { notes: "Atualizado" },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(prisma.certificatePJ.update).not.toHaveBeenCalled();
  });

  it("updateCertificatePj blocks duplicates when name, cnpj or model change", async () => {
    const prisma = {
      certificatePJ: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(createCertificatePjRecord())
          .mockResolvedValueOnce(createCertificatePjRecord({ id: "duplicate-id" })),
        update: vi.fn(),
      },
    };
    const service = new CertificatePjService(prisma as never);

    await expect(
      service.updateCertificatePj({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { model: "A3" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePJ.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: certificateOrganizationId,
        name: "Empresa Castelo",
        cnpj: "11222333000144",
        model: "A3",
        NOT: { id: certificateId },
      },
    });
    expect(prisma.certificatePJ.update).not.toHaveBeenCalled();
  });

  it("uploadCertificatePjFile stores encrypted bytes under organization-scoped path and updates metadata", async () => {
    const now = new Date("2026-05-28T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { storage, crypto, storedObjects } = createCertificateFileDeps();
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => createCertificatePjRecord({ file_path: null })),
        update: vi.fn(async ({ data }) => createCertificatePjRecord(data)),
      },
    };
    const service = new CertificatePjService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });
    const originalBuffer = Buffer.from("certificate-pj-bytes");

    try {
      const result = await service.uploadCertificatePjFile({
        id: certificateId,
        organizationId: certificateOrganizationId,
        userId: certificateUserId,
        file: {
          buffer: originalBuffer,
          mimetype: "application/x-pkcs12",
          originalname: "Empresa Castelo.pfx",
          size: originalBuffer.length,
        },
      });

      expect(storage.putObject).toHaveBeenCalledWith({
        path: expect.stringMatching(
          /^organizations\/10000000-0000-4000-8000-000000000001\/certificate-pj\/20000000-0000-4000-8000-000000000001\/\d+_Empresa_Castelo\.pfx\.enc$/,
        ),
        buffer: expect.any(Buffer),
        contentType: "application/octet-stream",
      });
      const storedBuffer = storedObjects.get(result.file_path);
      expect(storedBuffer?.equals(originalBuffer)).toBe(false);
      expect(prisma.certificatePJ.update).toHaveBeenCalledWith({
        where: { id: certificateId, organization_id: certificateOrganizationId },
        data: expect.objectContaining({
          file_path: result.file_path,
          file_original_name: "Empresa Castelo.pfx",
          file_mime_type: "application/x-pkcs12",
          file_size_bytes: originalBuffer.length,
          file_uploaded_at: now,
          file_uploaded_by_user_id: certificateUserId,
          file_storage_provider: "local",
          file_storage_bucket: "Certificados",
          file_encryption_key_version: "v1",
          has_certificate: true,
        }),
      });
      expect(result).not.toHaveProperty("file_encryption_iv");
      expect(result).not.toHaveProperty("file_encryption_tag");
    } finally {
      vi.useRealTimers();
    }
  });

  it("downloadCertificatePjFile decrypts original bytes from tenant-scoped metadata", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const originalBuffer = Buffer.from("certificate-pj-bytes");
    const encrypted = crypto.encrypt(originalBuffer);
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pj/20000000-0000-4000-8000-000000000001/file.pfx.enc";
    storage.getObject.mockResolvedValueOnce(encrypted.encryptedBuffer);
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () =>
          createCertificatePjRecord({
            file_path: objectPath,
            file_original_name: "Empresa Castelo.pfx",
            file_mime_type: "application/x-pkcs12",
            file_size_bytes: originalBuffer.length,
            file_sha256: encrypted.sha256,
            file_encryption_iv: encrypted.ivBase64,
            file_encryption_tag: encrypted.authTagBase64,
            file_encryption_key_version: encrypted.keyVersion,
          }),
        ),
      },
    };
    const service = new CertificatePjService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    const result = await service.downloadCertificatePjFile({
      id: certificateId,
      organizationId: certificateOrganizationId,
    });

    expect(prisma.certificatePJ.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(storage.getObject).toHaveBeenCalledWith(objectPath);
    expect(result.buffer.equals(originalBuffer)).toBe(true);
    expect(result.originalName).toBe("Empresa Castelo.pfx");
    expect(result.mimeType).toBe("application/x-pkcs12");
  });

  it("downloadCertificatePjFile returns 404 when certificate belongs to another organization", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new CertificatePjService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    await expect(
      service.downloadCertificatePjFile({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("deleteCertificatePjFile clears file metadata and deletes the stored object", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pj/20000000-0000-4000-8000-000000000001/file.pfx.enc";
    const prisma = {
      certificatePJ: {
        findFirst: vi.fn(async () =>
          createCertificatePjRecord({
            file_path: objectPath,
            file_original_name: "Empresa Castelo.pfx",
            file_mime_type: "application/x-pkcs12",
            file_encryption_iv: "iv",
            file_encryption_tag: "tag",
          }),
        ),
        update: vi.fn(async ({ data }) => createCertificatePjRecord(data)),
      },
    };
    const service = new CertificatePjService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    const result = await service.deleteCertificatePjFile({
      id: certificateId,
      organizationId: certificateOrganizationId,
    });

    expect(prisma.certificatePJ.update).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
      data: {
        file_path: null,
        file_original_name: null,
        file_mime_type: null,
        file_size_bytes: null,
        file_sha256: null,
        file_uploaded_at: null,
        file_uploaded_by_user_id: null,
        file_storage_provider: null,
        file_storage_bucket: null,
        file_encryption_iv: null,
        file_encryption_tag: null,
        file_encryption_key_version: null,
        has_certificate: false,
      },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(objectPath);
    expect(result).toEqual({ ok: true });
  });
});
