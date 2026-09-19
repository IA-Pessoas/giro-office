import { randomUUID } from "node:crypto";
import path from "node:path";

import { error as logError, ServiceError } from "@workspace/shared";
import type { SupabaseClient } from "@workspace/shared/storage";
import { validateUploadFileSignature } from "@workspace/shared/upload";

export const LICENSE_PROTOCOL_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

const EXTENSIONS_BY_MIME_TYPE = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

export type LicenseProtocolMimeType = keyof typeof EXTENSIONS_BY_MIME_TYPE;

export interface LicenseProtocolUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface LicenseProtocolStorage {
  upload(input: {
    organizationId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile & { mimetype: LicenseProtocolMimeType };
  }): Promise<string>;
  deleteObject(objectPath: string): Promise<void>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

export function validateLicenseProtocolUploadFile(
  file: LicenseProtocolUploadFile | undefined,
): LicenseProtocolUploadFile & { mimetype: LicenseProtocolMimeType } {
  if (!file || file.size === 0 || file.buffer.length === 0) {
    throw new ServiceError(400, "Arquivo do protocolo é obrigatório.");
  }

  if (file.size > LICENSE_PROTOCOL_MAX_SIZE_BYTES) {
    throw new ServiceError(400, "Arquivo do protocolo excede o limite de 10 MB.");
  }

  if (!(file.mimetype in EXTENSIONS_BY_MIME_TYPE)) {
    throw new ServiceError(400, "Formato do protocolo não permitido.");
  }

  const mimetype = file.mimetype as LicenseProtocolMimeType;
  const extension = path.extname(file.originalname).toLowerCase();
  if (!(EXTENSIONS_BY_MIME_TYPE[mimetype] as readonly string[]).includes(extension)) {
    throw new ServiceError(400, "Extensão do protocolo não corresponde ao formato informado.");
  }

  validateUploadFileSignature(file);
  return { ...file, mimetype };
}

export function buildLicenseProtocolObjectPath(input: {
  organizationId: string;
  licenseId: string;
  fileId: string;
  mimetype: LicenseProtocolMimeType;
}): string {
  const extension = EXTENSIONS_BY_MIME_TYPE[input.mimetype][0];
  return `regularize/organizations/${input.organizationId}/licenses/${input.licenseId}/protocols/${input.fileId}${extension}`;
}

export function isLicenseProtocolObjectPath(
  objectPath: string,
  organizationId: string,
  licenseId: string,
): boolean {
  const prefix = `regularize/organizations/${organizationId}/licenses/${licenseId}/protocols/`;
  const fileName = objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/i.test(
    fileName,
  );
}

export class SupabaseLicenseProtocolStorage implements LicenseProtocolStorage {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = randomUUID,
  ) {}

  async upload(input: {
    organizationId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile & { mimetype: LicenseProtocolMimeType };
  }): Promise<string> {
    await this.assertPrivateBucket();
    const objectPath = buildLicenseProtocolObjectPath({
      organizationId: input.organizationId,
      licenseId: input.licenseId,
      fileId: this.createFileId(),
      mimetype: input.file.mimetype,
    });

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(objectPath, input.file.buffer, {
        contentType: input.file.mimetype,
        upsert: false,
      });

    if (error) {
      logError("Erro ao armazenar protocolo de licença", { err: error });
      throw new ServiceError(500, "Erro ao armazenar protocolo da licença.", error);
    }

    return objectPath;
  }

  async deleteObject(objectPath: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);
    if (error) {
      logError("Erro ao remover protocolo de licença", { err: error });
      throw new ServiceError(500, "Erro ao remover protocolo da licença.", error);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    await this.assertPrivateBucket();
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS);

    if (error || !data?.signedUrl) {
      logError("Erro ao gerar URL assinada do protocolo de licença", { err: error });
      throw new ServiceError(500, "Erro ao gerar acesso ao protocolo da licença.", error);
    }

    return data.signedUrl;
  }

  private async assertPrivateBucket(): Promise<void> {
    const { data, error } = await this.supabase.storage.getBucket(this.bucket);
    if (error || !data || data.public) {
      logError("Bucket de protocolos de licença ausente ou público", { err: error });
      throw new ServiceError(500, "Storage privado de protocolos não configurado.", error);
    }
  }
}
