import { error as logError, warn as logWarn, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CertificatePjListQuery,
  CreateCertificatePjInput,
  UpdateCertificatePjInput,
} from "../schemas/certificatePj.schemas.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type { createCertificateFileCrypto } from "./certificateFileCrypto.js";
import {
  buildCertificateObjectPath,
  type CertificateFileStorage,
} from "./certificateFileStorage.js";
import type { CertificateUploadFile } from "./certificateFileValidation.js";
import { isPrismaUniqueConstraintError } from "./prismaErrors.js";

export interface CertificatePjContext {
  organizationId: string;
}

export interface CertificatePjListInput extends CertificatePjContext {
  query: CertificatePjListQuery;
}

export interface CertificatePjGetInput extends CertificatePjContext {
  id: string;
  canViewPassword: boolean;
}

export interface CertificatePjCreateInput extends CertificatePjContext {
  data: CreateCertificatePjInput;
}

export interface CertificatePjUpdateInput extends CertificatePjContext {
  id: string;
  data: UpdateCertificatePjInput;
}

export interface CertificatePjFileInput extends CertificatePjContext {
  id: string;
}

export interface CertificatePjFileUploadInput extends CertificatePjFileInput {
  userId: string;
  file: CertificateUploadFile;
}

export interface CertificatePjPublicResult {
  id: string;
  client_castelo_status: boolean;
  client_focus_status: boolean;
  name: string;
  cnpj: string;
  responsible: string;
  model: string;
  legal_nature: string;
  expiration_date: Date;
  notes: string | null;
  was_paid: boolean;
  payment_date: Date | null;
  payment_amount: number | null;
  contact_info: string | null;
  has_certificate: boolean;
  organization_id: string;
}

export interface CertificatePjDetailResult extends CertificatePjPublicResult {
  password?: string;
}

export type CertificatePjListResult = CertificatePjPublicResult[];

export interface CertificatePjFileMetadataResult {
  file_original_name: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_uploaded_at: Date;
  file_uploaded_by_user_id: string;
  has_certificate: true;
}

export interface CertificatePjFileDownloadResult {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface CertificatePjFileDeleteResult {
  ok: true;
}

export interface CertificatePjFileDeps {
  fileStorage: CertificateFileStorage;
  fileCrypto: ReturnType<typeof createCertificateFileCrypto>;
  storageProvider: string;
  storageBucket: string;
}

type CertificatePjPrivateRecord = CertificatePjDetailResult &
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

const certificatePjPublicSelect = {
  id: true,
  client_castelo_status: true,
  client_focus_status: true,
  name: true,
  cnpj: true,
  responsible: true,
  model: true,
  legal_nature: true,
  expiration_date: true,
  notes: true,
  was_paid: true,
  payment_date: true,
  payment_amount: true,
  contact_info: true,
  has_certificate: true,
  organization_id: true,
};

function removePassword(record: CertificatePjDetailResult): CertificatePjPublicResult {
  const { password: _password, ...publicRecord } = record;
  return publicRecord;
}

function removeFilePrivateMetadata(record: CertificatePjPrivateRecord): CertificatePjDetailResult {
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

function buildListWhere(organizationId: string, query: CertificatePjListQuery) {
  return {
    organization_id: organizationId,
    ...(query.name ? { name: { contains: query.name, mode: "insensitive" as const } } : {}),
    ...(query.cnpj ? { cnpj: { contains: query.cnpj } } : {}),
    ...(query.responsible
      ? { responsible: { contains: query.responsible, mode: "insensitive" as const } }
      : {}),
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

export class CertificatePjService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fileDeps?: CertificatePjFileDeps,
  ) {}

  async listCertificatePj(input: CertificatePjListInput): Promise<CertificatePjListResult> {
    const pagination = getPaginationParams(input.query);
    const records = await this.prisma.certificatePJ.findMany({
      where: buildListWhere(input.organizationId, input.query),
      orderBy: [{ expiration_date: "asc" }, { name: "asc" }],
      ...pagination,
      select: certificatePjPublicSelect,
    });

    return records.map((record) => removePassword(removeFilePrivateMetadata(record)));
  }

  async getCertificatePj(input: CertificatePjGetInput): Promise<CertificatePjDetailResult> {
    const record = await this.prisma.certificatePJ.findFirst({
      where: {
        id: input.id,
        organization_id: input.organizationId,
      },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PJ nao encontrado.");
    }

    if (!input.canViewPassword) {
      return removePassword(removeFilePrivateMetadata(record));
    }

    return removeFilePrivateMetadata(record);
  }

  async createCertificatePj(input: CertificatePjCreateInput): Promise<CertificatePjDetailResult> {
    try {
      const existing = await this.prisma.certificatePJ.findFirst({
        where: {
          organization_id: input.organizationId,
          name: input.data.name,
          cnpj: input.data.cnpj,
          model: input.data.model,
        },
      });

      if (existing) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.");
      }

      const record = await this.prisma.certificatePJ.create({
        data: {
          ...input.data,
          organization_id: input.organizationId,
          has_certificate: false,
        },
      });

      return removeFilePrivateMetadata(record);
    } catch (err: unknown) {
      logError("Erro ao criar certificado PJ", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao criar certificado PJ.", err);
    }
  }

  async updateCertificatePj(input: CertificatePjUpdateInput): Promise<CertificatePjDetailResult> {
    try {
      const existing = await this.prisma.certificatePJ.findFirst({
        where: { id: input.id, organization_id: input.organizationId },
      });

      if (!existing) {
        throw new ServiceError(404, "Certificado PJ nao encontrado.");
      }

      const name = input.data.name ?? existing.name;
      const cnpj = input.data.cnpj ?? existing.cnpj;
      const model = input.data.model ?? existing.model;
      const shouldCheckDuplicate =
        input.data.name !== undefined ||
        input.data.cnpj !== undefined ||
        input.data.model !== undefined;

      if (shouldCheckDuplicate) {
        const duplicate = await this.prisma.certificatePJ.findFirst({
          where: {
            organization_id: input.organizationId,
            name,
            cnpj,
            model,
            NOT: { id: input.id },
          },
        });

        if (duplicate) {
          throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.");
        }
      }

      const record = await this.prisma.certificatePJ.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: input.data,
      });

      return removeFilePrivateMetadata(record);
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PJ", { err });
      if (err instanceof ServiceError) throw err;
      if (isPrismaUniqueConstraintError(err)) {
        throw new ServiceError(409, "Ja existe um certificado PJ com estes dados.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar certificado PJ.", err);
    }
  }

  async uploadCertificatePjFile(
    input: CertificatePjFileUploadInput,
  ): Promise<CertificatePjFileMetadataResult> {
    const deps = this.requireFileDeps();

    const existing = await this.findCertificatePjForFile(input);
    const encrypted = deps.fileCrypto.encrypt(input.file.buffer);
    const objectPath = buildCertificateObjectPath({
      organizationId: input.organizationId,
      kind: "pj",
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
      await this.prisma.certificatePJ.update({
        where: { id: input.id, organization_id: input.organizationId },
        data: metadata,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar metadados do arquivo do certificado PJ", { err });
      try {
        await deps.fileStorage.deleteObject(objectPath);
      } catch (cleanupErr: unknown) {
        logWarn("Erro ao remover arquivo novo apos falha de metadados do certificado PJ", {
          err: cleanupErr,
        });
      }
      throw err;
    }

    if (existing.file_path && existing.file_path !== objectPath) {
      try {
        await deps.fileStorage.deleteObject(existing.file_path);
      } catch (err: unknown) {
        logWarn("Erro ao remover arquivo anterior do certificado PJ", { err });
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

  async downloadCertificatePjFile(
    input: CertificatePjFileInput,
  ): Promise<CertificatePjFileDownloadResult> {
    const deps = this.requireFileDeps();
    const record = await this.findCertificatePjForFile(input);
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

  async deleteCertificatePjFile(
    input: CertificatePjFileInput,
  ): Promise<CertificatePjFileDeleteResult> {
    const deps = this.requireFileDeps();
    const record = await this.findCertificatePjForFile(input);
    const fileMetadata = this.requireStoredFile(record);

    await deps.fileStorage.deleteObject(fileMetadata.filePath);
    await this.prisma.certificatePJ.update({
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

  async deleteCertificatePj(
    input: CertificatePjFileInput,
  ): Promise<CertificatePjFileDeleteResult> {
    const record = await this.findCertificatePjForFile(input);

    if (record.file_path) {
      await this.requireFileDeps().fileStorage.deleteObject(record.file_path);
    }

    await this.prisma.certificatePJ.delete({
      where: { id: input.id, organization_id: input.organizationId },
    });

    return { ok: true };
  }

  private requireFileDeps(): CertificatePjFileDeps {
    if (!this.fileDeps) {
      throw new ServiceError(500, "Storage de arquivo de certificado nao configurado.");
    }

    return this.fileDeps;
  }

  private async findCertificatePjForFile(
    input: CertificatePjFileInput,
  ): Promise<CertificatePjPrivateRecord> {
    const record = await this.prisma.certificatePJ.findFirst({
      where: { id: input.id, organization_id: input.organizationId },
    });

    if (!record) {
      throw new ServiceError(404, "Certificado PJ nao encontrado.");
    }

    return record;
  }

  private requireStoredFile(record: CertificatePjPrivateRecord): {
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
      throw new ServiceError(404, "Arquivo do certificado PJ nao encontrado.");
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
