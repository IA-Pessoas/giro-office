import "./envBootstrap.js";

import type { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { createCertificateFileCrypto } from "../services/certificateFileCrypto.js";
import { createCertificatePasswordCrypto } from "../services/certificatePasswordCrypto.js";
import { CertificatePfService as CertificatePfServiceBase } from "../services/certificatePfService.js";
import {
  certificateOrganizationId,
  certificateUserId,
  createCertificatePasswordCryptoForTest,
} from "./testUtils.js";

const certificateId = "30000000-0000-4000-8000-000000000001";
const passwordCrypto = createCertificatePasswordCryptoForTest();

class CertificatePfService extends CertificatePfServiceBase {
  constructor(
    prisma: ConstructorParameters<typeof CertificatePfServiceBase>[0],
    fileDeps?: ConstructorParameters<typeof CertificatePfServiceBase>[1],
  ) {
    super(prisma, fileDeps, passwordCrypto);
  }
}
const privateFileMetadataFields = [
  "file_path",
  "file_original_name",
  "file_mime_type",
  "file_size_bytes",
  "file_sha256",
  "file_uploaded_at",
  "file_uploaded_by_user_id",
  "file_storage_provider",
  "file_storage_bucket",
  "file_encryption_iv",
  "file_encryption_tag",
  "file_encryption_key_version",
];

function createCertificatePfRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: certificateId,
    client_castelo_status: true,
    client_focus_status: false,
    name: "Joao Silva",
    cpf: "12345678901",
    model: "A1",
    password: passwordCrypto.encrypt("secret-password"),
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

function expectNoPrivateFileMetadata(result: Record<string, unknown>) {
  for (const field of privateFileMetadataFields) {
    expect(result).not.toHaveProperty(field);
  }
}

describe("CertificatePfService", () => {
  it("listCertificatePf filters by organization_id and never selects password", async () => {
    const prisma = {
      certificatePF: {
        count: vi.fn(async () => 21),
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
    expect(result).toEqual({
      items: [expect.objectContaining({ id: certificateId })],
      total: 21,
      page: 3,
      page_size: 10,
      has_more: false,
      summary: { expired: 21, expiring_30_days: 21, with_certificate: 21 },
    });
    expect(result.items[0]).not.toHaveProperty("password");
    expect(result.items[0]).not.toHaveProperty("file_path");
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
    expect(result).not.toHaveProperty("file_path");
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

  it("decrypts the persisted password only for an authorized detail read", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () =>
          createCertificatePfRecord({ password: crypto.encrypt("senha-segura") }),
        ),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    await expect(
      service.getCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        canViewPassword: true,
      }),
    ).resolves.toMatchObject({ password: "senha-segura" });
  });

  it("flags a password encrypted with an unknown key without exposing it", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const otherCrypto = createCertificatePasswordCrypto({
      keyBase64: Buffer.alloc(32, 5).toString("base64"),
      keyVersion: "v1",
    });
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () =>
          createCertificatePfRecord({ password: otherCrypto.encrypt("senha-legada") }),
        ),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: true,
    });

    expect(result).toMatchObject({ id: certificateId, password_unavailable: true });
    expect(result).not.toHaveProperty("password");
  });

  it("flags an undecryptable password instead of failing the detail read", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ password: '{"v":"v1"}' })),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    await expect(
      service.getCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        canViewPassword: true,
      }),
    ).resolves.toMatchObject({ password_unavailable: true });
  });

  it.each([
    " []",
    ' "senha"',
    '  {"v":"v1"}',
  ])("flags persisted JSON that is not an envelope as unavailable: %s", async (password) => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ password })),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    await expect(
      service.getCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        canViewPassword: true,
      }),
    ).resolves.toMatchObject({ password_unavailable: true });
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("migrates a legacy password during an authorized detail read", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ password: "senha-legada" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    await expect(
      service.getCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        canViewPassword: true,
      }),
    ).resolves.toMatchObject({ password: "senha-legada" });

    expect(prisma.certificatePF.updateMany).toHaveBeenCalledWith({
      where: {
        id: certificateId,
        organization_id: certificateOrganizationId,
        password: "senha-legada",
      },
      data: { password: expect.any(String) },
    });
    const password = vi.mocked(prisma.certificatePF.updateMany).mock.calls[0]?.[0].data.password;
    expect(password).not.toBe("senha-legada");
    expect(crypto.decrypt(password as string)).toBe("senha-legada");
  });

  it("does not overwrite a concurrent password change during legacy migration", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ password: "senha-legada" })),
        update: vi.fn(async () => createCertificatePfRecord()),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    await expect(
      service.getCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
        canViewPassword: true,
      }),
    ).resolves.toMatchObject({ password: "senha-legada" });

    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
    expect(prisma.certificatePF.updateMany).toHaveBeenCalledWith({
      where: {
        id: certificateId,
        organization_id: certificateOrganizationId,
        password: "senha-legada",
      },
      data: { password: expect.any(String) },
    });
  });

  it("does not decrypt or migrate a password for a Viewer", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const decrypt = vi.spyOn(crypto, "decrypt");
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () =>
          createCertificatePfRecord({ password: crypto.encrypt("senha-segura") }),
        ),
        update: vi.fn(),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.getCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      canViewPassword: false,
    });

    expect(result).not.toHaveProperty("password");
    expect(decrypt).not.toHaveBeenCalled();
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("encrypts a password before creating a certificate", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.createCertificatePf({
      organizationId: certificateOrganizationId,
      data: {
        client_castelo_status: true,
        client_focus_status: false,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A1",
        password: "senha-segura",
        expiration_date: new Date("2026-12-31T00:00:00.000Z"),
        was_paid: true,
      },
    });

    const password = vi.mocked(prisma.certificatePF.create).mock.calls[0]?.[0].data.password;
    expect(password).not.toBe("senha-segura");
    expect(crypto.decrypt(password as string)).toBe("senha-segura");
    expect(result).not.toHaveProperty("password");
  });

  it("does not serialize a password when creating without one", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const encrypt = vi.spyOn(crypto, "encrypt");
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.createCertificatePf({
      organizationId: certificateOrganizationId,
      data: {
        client_castelo_status: true,
        client_focus_status: false,
        name: "Joao Silva",
        cpf: "12345678901",
        model: "A1",
        expiration_date: new Date("2026-12-31T00:00:00.000Z"),
        was_paid: true,
      } as never,
    });

    expect(encrypt).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("password");
  });

  it("encrypts a password before updating a certificate", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
        update: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.updateCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      data: { password: "senha-segura" },
    });

    const password = vi.mocked(prisma.certificatePF.update).mock.calls[0]?.[0].data.password;
    expect(password).not.toBe("senha-segura");
    expect(crypto.decrypt(password as string)).toBe("senha-segura");
    expect(result).not.toHaveProperty("password");
  });

  it("does not serialize a password when updating without one", async () => {
    const crypto = createCertificatePasswordCryptoForTest();
    const encrypt = vi.spyOn(crypto, "encrypt");
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
        update: vi.fn(async ({ data }) => createCertificatePfRecord(data)),
      },
    };
    const service = new CertificatePfServiceBase(prisma as never, undefined, crypto);

    const result = await service.updateCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      data: { notes: "Atualizado" },
    });

    expect(encrypt).not.toHaveBeenCalled();
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
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    } satisfies Partial<ServiceError>);
  });

  it("createCertificatePf does not expose private file metadata returned by Prisma", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) =>
          createCertificatePfRecord({
            ...data,
            file_path:
              "organizations/10000000-0000-4000-8000-000000000001/certificate-pf/30000000-0000-4000-8000-000000000001/file.pfx.enc",
            file_original_name: "Joao Silva.pfx",
            file_mime_type: "application/x-pkcs12",
            file_size_bytes: 128,
            file_sha256: "hash",
            file_uploaded_at: new Date("2026-05-28T12:00:00.000Z"),
            file_uploaded_by_user_id: certificateUserId,
            file_storage_provider: "local",
            file_storage_bucket: "Certificados",
            file_encryption_iv: "iv",
            file_encryption_tag: "tag",
            file_encryption_key_version: "v1",
          }),
        ),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.createCertificatePf({
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
      },
    });

    expectNoPrivateFileMetadata(result as unknown as Record<string, unknown>);
    expect(result.has_certificate).toBe(false);
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

  it("updateCertificatePf does not expose private file metadata returned by Prisma", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord()),
        update: vi.fn(async ({ data }) =>
          createCertificatePfRecord({
            ...data,
            file_path:
              "organizations/10000000-0000-4000-8000-000000000001/certificate-pf/30000000-0000-4000-8000-000000000001/file.pfx.enc",
            file_original_name: "Joao Silva.pfx",
            file_mime_type: "application/x-pkcs12",
            file_size_bytes: 128,
            file_sha256: "hash",
            file_uploaded_at: new Date("2026-05-28T12:00:00.000Z"),
            file_uploaded_by_user_id: certificateUserId,
            file_storage_provider: "local",
            file_storage_bucket: "Certificados",
            file_encryption_iv: "iv",
            file_encryption_tag: "tag",
            file_encryption_key_version: "v1",
          }),
        ),
      },
    };
    const service = new CertificatePfService(prisma as never);

    const result = await service.updateCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
      data: { notes: "Atualizado" },
    });

    expectNoPrivateFileMetadata(result as unknown as Record<string, unknown>);
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
      const storedPath = storage.putObject.mock.calls[0]?.[0].path;
      const storedBuffer = storedObjects.get(storedPath);
      expect(storedBuffer?.equals(originalBuffer)).toBe(false);
      expect(prisma.certificatePF.update).toHaveBeenCalledWith({
        where: { id: certificateId, organization_id: certificateOrganizationId },
        data: expect.objectContaining({
          file_path: storedPath,
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
      expect(result).not.toHaveProperty("file_path");
      expect(result).not.toHaveProperty("file_sha256");
      expect(result).not.toHaveProperty("file_storage_provider");
      expect(result).not.toHaveProperty("file_storage_bucket");
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

  it("deleteCertificatePfFile keeps metadata when storage deletion fails", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const objectPath =
      "organizations/10000000-0000-4000-8000-000000000001/certificate-pf/30000000-0000-4000-8000-000000000001/file.pfx.enc";
    storage.deleteObject.mockRejectedValueOnce(new Error("storage unavailable"));
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
        update: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    await expect(
      service.deleteCertificatePfFile({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toThrow("storage unavailable");

    expect(storage.deleteObject).toHaveBeenCalledWith(objectPath);
    expect(prisma.certificatePF.update).not.toHaveBeenCalled();
  });

  it("deleteCertificatePf removes the stored object before deleting the organization-scoped record", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const objectPath = "/certificates/pf/joao.pfx";
    const events: string[] = [];
    const deleteNotifications = vi.fn(async () => {
      events.push("prisma:delete-notifications");
    });
    storage.deleteObject.mockImplementation(async (path) => {
      events.push(`storage:${path}`);
    });
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async ({ where }) =>
          createCertificatePfRecord({
            id: where.id,
            organization_id: where.organization_id,
            file_path: objectPath,
          }),
        ),
        delete: vi.fn(async () => {
          events.push("prisma:delete");
        }),
      },
      certificateNotification: {
        deleteMany: deleteNotifications,
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    const result = await service.deleteCertificatePf({
      id: certificateId,
      organizationId: certificateOrganizationId,
    });

    expect(storage.deleteObject).toHaveBeenCalledWith(objectPath);
    expect(prisma.certificatePF.delete).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(deleteNotifications).toHaveBeenCalledWith({
      where: {
        certificate_id: certificateId,
        organization_id: certificateOrganizationId,
        type: "PF",
      },
    });
    expect(events).toEqual([
      `storage:${objectPath}`,
      "prisma:delete-notifications",
      "prisma:delete",
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("deleteCertificatePf does not delete a certificate from another organization", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => null),
        delete: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    await expect(
      service.deleteCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toMatchObject({ statusCode: 404 } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.findFirst).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.certificatePF.delete).not.toHaveBeenCalled();
  });

  it("deleteCertificatePf keeps the record when stored object removal fails", async () => {
    const { storage, crypto } = createCertificateFileDeps();
    const objectPath = "/certificates/pf/joao.pfx";
    storage.deleteObject.mockRejectedValueOnce(new Error("storage unavailable"));
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ file_path: objectPath })),
        delete: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never, {
      fileStorage: storage,
      fileCrypto: crypto,
      storageProvider: "local",
      storageBucket: "Certificados",
    });

    await expect(
      service.deleteCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toThrow("storage unavailable");
    expect(prisma.certificatePF.delete).not.toHaveBeenCalled();
  });

  it("deleteCertificatePf refuses to orphan a stored file when storage is unavailable", async () => {
    const objectPath = "/certificates/pf/joao.pfx";
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ file_path: objectPath })),
        delete: vi.fn(),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.deleteCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).rejects.toMatchObject({ statusCode: 500 } satisfies Partial<ServiceError>);
    expect(prisma.certificatePF.delete).not.toHaveBeenCalled();
  });

  it("deleteCertificatePf deletes a tenant record without a stored file", async () => {
    const prisma = {
      certificatePF: {
        findFirst: vi.fn(async () => createCertificatePfRecord({ file_path: null })),
        delete: vi.fn(async () => createCertificatePfRecord({ file_path: null })),
      },
      certificateNotification: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new CertificatePfService(prisma as never);

    await expect(
      service.deleteCertificatePf({
        id: certificateId,
        organizationId: certificateOrganizationId,
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.certificatePF.delete).toHaveBeenCalledWith({
      where: { id: certificateId, organization_id: certificateOrganizationId },
    });
  });
});
