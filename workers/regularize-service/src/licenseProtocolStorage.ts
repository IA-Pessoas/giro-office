import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";

export const LICENSE_PROTOCOL_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

const EXTENSIONS_BY_MIME_TYPE = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
} as const;

export type LicenseProtocolMimeType = keyof typeof EXTENSIONS_BY_MIME_TYPE;

export type LicenseProtocolUploadFile = {
  body: File;
  bytes: Uint8Array;
  mimetype: LicenseProtocolMimeType;
  originalname: string;
  size: number;
};

export interface WorkerLicenseProtocolStorageLike {
  upload(input: {
    organizationId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile;
  }): Promise<string>;
  deleteObject(objectPath: string): Promise<void>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasValidSignature(file: LicenseProtocolUploadFile): boolean {
  if (file.mimetype === "application/pdf")
    return new TextDecoder().decode(file.bytes.slice(0, 5)) === "%PDF-";
  if (file.mimetype === "image/jpeg") return startsWithBytes(file.bytes, [0xff, 0xd8, 0xff]);
  if (file.mimetype === "image/png") {
    return startsWithBytes(file.bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  return (
    file.bytes.length >= 12 &&
    new TextDecoder().decode(file.bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(file.bytes.slice(8, 12)) === "WEBP"
  );
}

export async function parseLicenseProtocolUpload(
  file: File | undefined,
): Promise<LicenseProtocolUploadFile> {
  if (!file || file.size === 0) throw new ServiceError(400, "Arquivo do protocolo é obrigatório.");
  if (file.size > LICENSE_PROTOCOL_MAX_SIZE_BYTES) {
    throw new ServiceError(400, "Arquivo do protocolo excede o limite de 10 MB.");
  }
  if (!(file.type in EXTENSIONS_BY_MIME_TYPE)) {
    throw new ServiceError(400, "Formato do protocolo não permitido.");
  }

  const mimetype = file.type as LicenseProtocolMimeType;
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!(EXTENSIONS_BY_MIME_TYPE[mimetype] as readonly string[]).includes(extension)) {
    throw new ServiceError(400, "Extensão do protocolo não corresponde ao formato informado.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = { body: file, bytes, mimetype, originalname: file.name, size: file.size };
  if (!hasValidSignature(parsed)) {
    throw new ServiceError(400, "Assinatura do arquivo não corresponde ao tipo informado.");
  }
  return parsed;
}

export function buildLicenseProtocolObjectPath(input: {
  organizationId: string;
  licenseId: string;
  fileId: string;
  mimetype: LicenseProtocolMimeType;
}): string {
  return `regularize/organizations/${input.organizationId}/licenses/${input.licenseId}/protocols/${input.fileId}${EXTENSIONS_BY_MIME_TYPE[input.mimetype][0]}`;
}

export function isLicenseProtocolObjectPath(
  objectPath: string,
  organizationId: string,
  licenseId: string,
): boolean {
  const prefix = `regularize/organizations/${organizationId}/licenses/${licenseId}/protocols/`;
  const fileName = objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/iu.test(
    fileName,
  );
}

export class WorkerLicenseProtocolStorage implements WorkerLicenseProtocolStorageLike {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
  ) {}

  static fromEnv(env: {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    REGULARIZE_LICENSE_PROTOCOL_BUCKET?: string;
    LICENSE_PROTOCOL_BUCKET?: string;
  }) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
    return new WorkerLicenseProtocolStorage(
      createSupabaseStorageClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      env.REGULARIZE_LICENSE_PROTOCOL_BUCKET ??
        env.LICENSE_PROTOCOL_BUCKET ??
        "regularize-license-protocols",
    );
  }

  async upload(input: {
    organizationId: string;
    licenseId: string;
    file: LicenseProtocolUploadFile;
  }): Promise<string> {
    await this.assertPrivateBucket();
    const objectPath = buildLicenseProtocolObjectPath({
      organizationId: input.organizationId,
      licenseId: input.licenseId,
      fileId: crypto.randomUUID(),
      mimetype: input.file.mimetype,
    });
    await this.storage.upload(this.bucket, objectPath, input.file.body, {
      contentType: input.file.mimetype,
      upsert: false,
    });
    return objectPath;
  }

  deleteObject(objectPath: string): Promise<void> {
    return this.storage.remove(this.bucket, objectPath);
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    await this.assertPrivateBucket();
    return this.storage.createSignedUrl(
      this.bucket,
      objectPath,
      LICENSE_PROTOCOL_SIGNED_URL_EXPIRES_IN_SECONDS,
    );
  }

  private async assertPrivateBucket(): Promise<void> {
    const bucket = await this.storage.getBucket(this.bucket);
    if (bucket.public)
      throw new ServiceError(500, "Storage privado de protocolos não configurado.");
  }
}
