import { error as logError, warn as logWarn, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CertificatePfListQuery,
  CreateCertificatePfInput,
  UpdateCertificatePfInput,
} from "../schemas/certificatePf.schemas.js";
import {
  buildPaginatedResult,
  getPaginationParams,
  type PaginatedResult,
} from "../schemas/pagination.schemas.js";
import type { createCertificateFileCrypto } from "./certificateFileCrypto.js";
import {
  buildCertificateObjectPath,
  type CertificateFileStorage,
} from "./certificateFileStorage.js";
import type { CertificateUploadFile } from "./certificateFileValidation.js";
import type { CertificatePasswordCrypto } from "./certificatePasswordCrypto.js";
import { isPrismaUniqueConstraintError } from "./prismaErrors.js";

export interface CertificatePfContext {
  organizationId: string;
}

export interface CertificatePfListInput extends CertificatePfContext {
  query: CertificatePfListQuery;
}

export interface CertificatePfGetInput extends CertificatePfContext {
  id: string;
  canViewPassword: boolean;
}

export interface CertificatePfCreateInput extends CertificatePfContext {
  data: CreateCertificatePfInput;
}

export interface CertificatePfUpdateInput extends CertificatePfContext {
  id: string;
  data: UpdateCertificatePfInput;
}

export interface CertificatePfDeleteInput extends CertificatePfContext {
  id: string;
}

export interface CertificatePfFileInput extends CertificatePfContext {
  id: string;
}

export interface CertificatePfFileUploadInput extends CertificatePfFileInput {
  userId: string;
  file: CertificateUploadFile;
}

export interface CertificatePfPublicResult {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cpf: string;
  model: string;
  expiration_date: Date;
  notes: string | null;
  enterprise: string | null;
  cnpj: string | null;
  was_paid: boolean;
  payment_date: Date | null;
  payment_amount: number | null;
  contact_info: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CertificatePfDetailResult extends CertificatePfPublicResult {
  password?: string;
}

export type CertificatePfListResult = PaginatedResult<CertificatePfPublicResult>;

export interface CertificatePfFileMetadataResult {
  file_original_name: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_uploaded_at: Date;
  file_uploaded_by_user_id: string;
  has_certificate: true;
}

export interface CertificatePfFileDownloadResult {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface CertificatePfFileDeleteResult {
  ok: true;
}

export interface CertificatePfDeleteResult {
  ok: true;
}

export interface CertificatePfFileDeps {
  fileStorage: CertificateFileStorage;
  fileCrypto: ReturnType<typeof createCertificateFileCrypto>;
  storageProvider: string;
  storageBucket: string;
}

type CertificatePfPrivateRecord = CertificatePfDetailResult &
  Partial<{
    file_path: string | null;
    file_original_name: string | null;
    file_mime_type: string | null;
    file_size_bytes: number | null;
    file_sha256: string | null;
    file_uploaded_at: Date | null;
    file_uploaded_by_user_id: string | null;
    file_storage_provider: string | null;
    file_storage_bucket: string | null;
    file_encryption_iv: string | null;
    file_encryption_tag: string | null;
    file_encryption_key_version: string | null;
  }>;

const certificatePfPublicSelect = {
  id: true,
  client_castelo_status: true,
  client_focus_status: true,
  name: true,
  cpf: true,
  model: true,
  expiration_date: true,
  notes: true,
  enterprise: true,
  cnpj: true,
  was_paid: true,
  payment_date: true,
  payment_amount: true,
  contact_info: true,
  has_certificate: true,
  organization_id: true,
};

function removePassword(record: CertificatePfDetailResult): CertificatePfPublicResult {
  const { password: _password, ...publicRecord } = record;
  return publicRecord;
}

function removeFilePrivateMetadata(record: CertificatePfPrivateRecord): CertificatePfDetailResult {
  const {
    file_path: _filePath,
    file_original_name: _fileOriginalName,
    file_mime_type: _fileMimeType,
    file_size_bytes: _fileSizeBytes,
    file_sha256: _fileSha256,
    file_uploaded_at: _fileUploadedAt,
    file_uploaded_by_user_id: _fileUploadedByUserId,
    file_storage_provider: _fileStorageProvider,
    file_storage_bucket: _fileStorageBucket,
    file_encryption_iv: _fileEncryptionIv,
    file_encryption_tag: _fileEncryptionTag,
    file_encryption_key_version: _fileEncryptionKeyVersion,
    ...safeRecord
  } = record;

  return safeRecord;
}

function buildListWhere(organizationId: string, query: CertificatePfListQuery) {
  return {
    organization_id: organizationId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { cpf: { contains: query.search } },
            { enterprise: { contains: query.search, mode: "insensitive" as const } },
            { cnpj: { contains: query.search } },
          ],
        }
      : {}),
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
    ...(query.cpf ? { cpf: { contains: query.cpf } } : {}),
    ...(query.enterprise
      ? { enterprise: { contains: query.enterprise, mode: "insensitive" as const } }
      : {}),
    ...(query.cnpj ? { cnpj: { contains: query.cnpj } } : {}),
    ...(query.model ? { model: query.model } : {}),
    ...(query.client_castelo_status === undefined
      ? {}
      : { client_castelo_status: query.client_castelo_status }),
    ...(query.client_focus_status === undefined
      ? {}
      : { client_focus_status: query.client_focus_status }),
    ...(query.was_paid === undefined ? {} : { was_paid: query.was_paid }),
    ...(query.has_certificate === undefined ? {} : { has_certificate: query.has_certificate }),
  };
}

export class CertificatePfService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileDeps?: CertificatePfFileDeps,
    private readonly passwordCrypto?: CertificatePasswordCrypto,
  ) {}

  async listCertificatePf(input: CertificatePfListInput): Promise<CertificatePfListResult> {
    const pagination = getPaginationParams(input.query);
    const where = buildListWhere(input.organizationId, input.query);
    const [total, records] = await Promise.all([
      this.prisma.certificatePF.count({ where }),
      this.prisma.certificatePF.findMany({
        where,
        orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
        ...pagination,
        select: certificatePfPublicSelect,
      }),
    ]);

    return buildPaginatedResult(
      records.map((record) => removePassword(removeFilePrivateMetadata(record))),
      total,
      input.query,
    );
  }

  async getCertificatePf(input: CertificatePfGetInput): Promise<CertificatePfDetailResult> {
    const record = await this.prisma.certificatePF.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
      },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PF nao encontrado.");
    }

    if (!input.canViewPassword) {
      return removePassword(removeFilePrivateMetadata(record));
    }

    if (record.password === undefined) {
      return removeFilePrivateMetadata(record);
    }

    const passwordCrypto = this.requirePasswordCrypto();
    if (record.password.startsWith("{")) {
      return removeFilePrivateMetadata({
        ...record,
        password: passwordCrypto.decrypt(record.password),
      });
    }

    await this.prisma.certificatePF.update({
      where: { id: input.id, organization_id: input.organizationId },
      data: { password: passwordCrypto.encrypt(record.password) },
    });

    return removeFilePrivateMetadata(record);
  }

  async createCertificatePf(input: CertificatePfCreateInput): Promise<CertificatePfDetailResult> {
    try {
      const existing = await this.prisma.certificatePF.findFirst({
        where: {
          organization_id: input.organizationId,
          name: input.data.name,
          cpf: input.data.cpf,
          model: input.data.model,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um certificado PF com estes dados.");
      }

      const record = await this.prisma.certificatePF.create({
        data: {
          ...input.data,
          ...(input.data.password === undefined
            ? {}
            : { password: this.requirePasswordCrypto().encrypt(input.data.password) }),
          organization_id: input.organizationId,
          has_certificate: false,
        },
      });

      return removeFilePrivateMetadata(record);
    } catch (err: unknown) {
      logError("Erro ao criar certificado PF", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PF com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao criar certificado PF.", err);
    }
  }

  async updateCertificatePf(input: CertificatePfUpdateInput): Promise<CertificatePfDetailResult> {
    try {
      const existing = await this.prisma.certificatePF.findFirst({
        where: { id: input.id, organization_id: input.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Certificado PF nao encontrado.");
      }

      const name = input.data.name ?? existing.name;
      const cpf = input.data.cpf ?? existing.cpf;
      const model = input.data.model ?? existing.model;
      const shouldCheckDuplicate =
        input.data.name !== undefined ||
        input.data.cpf !== undefined ||
        input.data.model !== undefined;

      if (shouldCheckDuplicate) {
        const duplicate = await this.prisma.certificatePF.findFirst({
          where: {
            organization_id: input.organizationId,
            name,
            cpf,
            model,
            NOT: { id: input.id },
          },
        });

        if (duplicate) {
          throw new ServiceError(409, "Ja existe um certificado PF com estes dados.");
        }
      }

      const record = await this.prisma.certificatePF.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: {
          ...input.data,
          ...(input.data.password === undefined
            ? {}
            : { password: this.requirePasswordCrypto().encrypt(input.data.password) }),
        },
      });

      return removeFilePrivateMetadata(record);
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PF", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PF com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar certificado PF.", err);
    }
  }

  async deleteCertificatePf(input: CertificatePfDeleteInput): Promise<CertificatePfDeleteResult> {
    const record = await this.prisma.certificatePF.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PF nao encontrado.");
    }

    if (record.file_path) {
      const deps = this.requireFileDeps();
      await deps.fileStorage.deleteObject(record.file_path);
    }

    await this.prisma.certificateNotification.deleteMany({
      where: {
        certificate_id: input.id,
        organization_id: input.organizationId,
        type: "PF",
      },
    });

    await this.prisma.certificatePF.delete({
      where: { id: input.id, organization_id: input.organizationId },
    });

    return { ok: true };
  }

  async uploadCertificatePfFile(
    input: CertificatePfFileUploadInput,
  ): Promise<CertificatePfFileMetadataResult> {
    const deps = this.requireFileDeps();

    const existing = await this.findCertificatePfForFile(input);
    const encrypted = deps.fileCrypto.encrypt(input.file.buffer);
    const objectPath = buildCertificateObjectPath({
      organizationId: input.organizationId,
      kind: "pf",
      certificateId: input.id,
      originalName: input.file.originalname,
    });

    await deps.fileStorage.putObject({
      path: objectPath,
      buffer: encrypted.encryptedBuffer,
      contentType: "application/octet-stream",
    });

    const uploadedAt = new Date();
    const metadata = {
      file_path: objectPath,
      file_original_name: input.file.originalname,
      file_mime_type: input.file.mimetype,
      file_size_bytes: input.file.size,
      file_sha256: encrypted.sha256,
      file_uploaded_at: uploadedAt,
      file_uploaded_by_user_id: input.userId,
      file_storage_provider: deps.storageProvider,
      file_storage_bucket: deps.storageBucket,
      file_encryption_iv: encrypted.ivBase64,
      file_encryption_tag: encrypted.authTagBase64,
      file_encryption_key_version: encrypted.keyVersion,
      has_certificate: true,
    };

    try {
      await this.prisma.certificatePF.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: metadata,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar metadados do arquivo do certificado PF", { err });
      try {
        await deps.fileStorage.deleteObject(objectPath);
      } catch (cleanupErr: unknown) {
        logWarn("Erro ao remover arquivo novo apos falha de metadados do certificado PF", {
          err: cleanupErr,
        });
      }
      throw err;
    }

    if (existing.file_path && existing.file_path !== objectPath) {
      try {
        await deps.fileStorage.deleteObject(existing.file_path);
      } catch (err: unknown) {
        logWarn("Erro ao remover arquivo anterior do certificado PF", { err });
      }
    }

    return {
      file_original_name: metadata.file_original_name,
      file_mime_type: metadata.file_mime_type,
      file_size_bytes: metadata.file_size_bytes,
      file_uploaded_at: metadata.file_uploaded_at,
      file_uploaded_by_user_id: metadata.file_uploaded_by_user_id,
      has_certificate: true,
    };
  }

  async downloadCertificatePfFile(
    input: CertificatePfFileInput,
  ): Promise<CertificatePfFileDownloadResult> {
    const deps = this.requireFileDeps();
    const record = await this.findCertificatePfForFile(input);
    const fileMetadata = this.requireStoredFile(record);
    const encryptedBuffer = await deps.fileStorage.getObject(fileMetadata.filePath);
    const buffer = deps.fileCrypto.decrypt({
      encryptedBuffer,
      ivBase64: fileMetadata.ivBase64,
      authTagBase64: fileMetadata.authTagBase64,
    });

    return {
      buffer,
      originalName: fileMetadata.originalName,
      mimeType: fileMetadata.mimeType,
    };
  }

  async deleteCertificatePfFile(
    input: CertificatePfFileInput,
  ): Promise<CertificatePfFileDeleteResult> {
    const deps = this.requireFileDeps();
    const record = await this.findCertificatePfForFile(input);
    const fileMetadata = this.requireStoredFile(record);

    await deps.fileStorage.deleteObject(fileMetadata.filePath);
    await this.prisma.certificatePF.update({
      where: { id: input.id, organization_id: input.organizationId },
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

    return { ok: true };
  }

  private requireFileDeps(): CertificatePfFileDeps {
    if (!this.fileDeps) {
      throw new ServiceError(500, "Storage de arquivo de certificado nao configurado.");
    }

    return this.fileDeps;
  }

  private requirePasswordCrypto(): CertificatePasswordCrypto {
    if (!this.passwordCrypto) {
      throw new ServiceError(500, "Criptografia de senha de certificado nao configurada.");
    }

    return this.passwordCrypto;
  }

  private async findCertificatePfForFile(
    input: CertificatePfFileInput,
  ): Promise<CertificatePfPrivateRecord> {
    const record = await this.prisma.certificatePF.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PF nao encontrado.");
    }

    return record;
  }

  private requireStoredFile(record: CertificatePfPrivateRecord): {
    filePath: string;
    originalName: string;
    mimeType: string;
    ivBase64: string;
    authTagBase64: string;
  } {
    if (
      !record.file_path ||
      !record.file_original_name ||
      !record.file_mime_type ||
      !record.file_encryption_iv ||
      !record.file_encryption_tag
    ) {
      throw new ServiceError(404, "Arquivo do certificado PF nao encontrado.");
    }

    return {
      filePath: record.file_path,
      originalName: record.file_original_name,
      mimeType: record.file_mime_type,
      ivBase64: record.file_encryption_iv,
      authTagBase64: record.file_encryption_tag,
    };
  }
}
