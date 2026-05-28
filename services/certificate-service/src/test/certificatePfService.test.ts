import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import { CertificatePfService } from "../services/certificatePfService.js";
import { certificateOrganizationId, certificateUserId } from "./testUtils.js";

const certificateId = "30000000-0000-4000-8000-000000000001";

function createCertificatePfRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: certificateId,
    client_castelo_status: true,
    client_focus_status: false,
    name: "Joao Silva",
    cpf: "12345678901",
    model: "A1",
    password: "secret-password",
    expiration_date: new Date("2026-12-31T00:00:00.000Z"),
    notes: "Renovar com antecedencia",
    enterprise: "Empresa Castelo",
    cnpj: "11222333000144",
    was_paid: true,
    payment_date: new Date("2026-01-10T00:00:00.000Z"),
    payment_amount: 250,
    contact_info: "certificados@example.com",
    file_path: "/certificates/pf/joao.pfx",
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

describe("CertificatePfService", () => {
  it("listCertificatePf filters by organization_id and never selects password", async () => {
    const prisma = {
      certificatePF: {
        findMany: vi.fn(async () => [createCertificatePfRecord()]),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.listCertificatePf({
      organizationId: certificateOrganizationId,
      query: { search: "Joao", has_certificate: true, page: 3, page_size: 10 },
    });

    expect(prisma.certificatePF.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        OR: [
          { name: { contains: "Joao", mode: "insensitive" } },
          { cpf: { contains: "Joao" } },
          { enterprise: { contains: "Joao", mode: "insensitive" } },
          { cnpj: { contains: "Joao" } },
        ],
        has_certificate: true,
      },
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      skip: 20,
      take: 10,
      select: expect.not.objectContaining({ password: true }),
    });
    expect(result[0]).not.toHaveProperty("password");
  });

  it("getCertificatePf returns password when canViewPassword is true", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: true,
    });

    expect(result.password).toBe("secret-password");
  });

  it("getCertificatePf removes password when canViewPassword is false", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: false,
    });

    expect(result).not.toHaveProperty("password");
  });

  it("createCertificatePf blocks duplicates by organization_id, name, cpf and model", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => ({ id: certificateId })),
        create: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.createCertificatePf({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Joao Silva",
          cpf: "12345678901",
          model: "A1",
          password: "secret-password",
          expiration_date: new Date("2026-12-31T00:00:00.000Z"),
          was_paid: true,
          has_certificate: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: certificateOrganizationId,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A1",
      },
    });
    expect(prisma.certificatePF.create).not.toHaveBeenCalled();
  });

  it("createCertificatePf maps database unique violations to conflict", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => {
          throw { code: "P2002" };
        }),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.createCertificatePf({
        organizationId: certificateOrganizationId,
        data: {
          client_castelo_status: true,
          client_focus_status: false,
          name: "Joao Silva",
          cpf: "12345678901",
          model: "A1",
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

  it("updateCertificatePf returns 404 when record does not exist in organization", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.updateCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { notes: "Atualizado" },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("updateCertificatePf blocks duplicates when name, cpf or model change", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(createCertificatePfRecord())
          .mockResolvedValueOnce(createCertificatePfRecord({ id: "duplicate-id" })),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.updateCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        data: { model: "A3" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        organization_id: certificateOrganizationId,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A3",
        NOT: { id: certificateId },
      },
    });
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("uploadCertificatePfFile stores encrypted bytes under organization-scoped path and updates metadata", async () => {
    const now = new Date("2026-05-28T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { storage, crypto, storedObjects } = createCertificateFileDeps();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ file_path: null })),
        update: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });
    const originalBuffer = Buffer.from("certificate-pf-bytes");

    try {
      const result = await service.uploadCertificatePfFile({
        id: certificateId,
        organizationId: certificateOrganizationId,
        userId: certificateUserId,
        file: {
          buffer: originalBuffer,
          mimetype: "application/x-pkcs12",
          originalname: "Joao Silva.pfx",
          size: originalBuffer.length,
        },
      });

      expect(storage.putObject).toHaveBeenCalledWith({
        path: expect.stringMatching(
          /^organizations\/10000000-0000-4000-8000-000000000001\/certificate-pf\/30000000-0000-4000-8000-000000000001\/\d+_Joao_Silva\.pfx\.enc$/,
        ),
        buffer: expect.any(Buffer),
        contentType: "application/octet-stream",
      });
      const storedBuffer = storedObjects.get(result.file_path);
      expect(storedBuffer?.equals(originalBuffer)).toBe(false);
      expect(prisma.certificatePF.update).toHaveBeenCalledWith({
        where: { id: certificateId, organization_id: certificateOrganizationId },
        data: expect.objectContaining({
          file_path: result.file_path,
          file_original_name: "Joao Silva.pfx",
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

  it("downloadCertificatePfFile decrypts original bytes from tenant-scoped metadata", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const originalBuffer = Buffer.from("certificate-pf-bytes");
    const encrypted = crypto.encrypt(originalBuffer);
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pf/30000000-0000-4000-8000-000000000001/file.pfx.enc";
    storage.getObject.mockResolvedValueOnce(encrypted.encryptedBuffer);
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () =>
          createCertificatePfRecord({
            file_path: objectPath,
            file_original_name: "Joao Silva.pfx",
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
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    const result = await service.downloadCertificatePfFile({
      id: certificateId,
      organizationId: certificateOrganizationId,
    });

    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(storage.getObject).toHaveBeenCalledWith(objectPath);
    expect(result.buffer.equals(originalBuffer)).toBe(true);
    expect(result.originalName).toBe("Joao Silva.pfx");
    expect(result.mimeType).toBe("application/x-pkcs12");
  });

  it("downloadCertificatePfFile returns 404 when certificate belongs to another organization", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    await expect(
      service.downloadCertificatePfFile({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<ServiceError>);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("deleteCertificatePfFile clears file metadata and deletes the stored object", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pf/30000000-0000-4000-8000-000000000001/file.pfx.enc";
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () =>
          createCertificatePfRecord({
            file_path: objectPath,
            file_original_name: "Joao Silva.pfx",
            file_mime_type: "application/x-pkcs12",
            file_encryption_iv: "iv",
            file_encryption_tag: "tag",
          }),
        ),
        update: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    const result = await service.deleteCertificatePfFile({
      id: certificateId,
      organizationId: certificateOrganizationId,
    });

    expect(prisma.certificatePF.update).toHaveBeenCalledWith({
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
