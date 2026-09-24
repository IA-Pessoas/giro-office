import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { ServiceError } from "@workspace/shared/http";
import { validateUploadFileSignature } from "@workspace/shared/upload";

export const HISTORY_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const HISTORY_FILE_SIGNED_URL_EXPIRES_IN_SECONDS = 300;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function validateFile(file: File): Promise<Uint8Array> {
  if (!file || file.size === 0) throw new ServiceError(400, "Arquivo é obrigatório.");
  if (file.size > HISTORY_FILE_MAX_SIZE_BYTES) {
    throw new ServiceError(400, "Arquivo excede o limite de 10 MB.");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type))
    throw new ServiceError(400, "Tipo de arquivo não permitido.");
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    validateUploadFileSignature({
      buffer: Buffer.from(bytes),
      mimetype: file.type,
      originalname: file.name,
    });
    return bytes;
  });
}

export interface WorkerHistoryStorageLike {
  upload(clientId: string, file: File): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
  download(objectPath: string): Promise<Response>;
  remove(objectPath: string): Promise<void>;
}

export class WorkerHistoryStorage implements WorkerHistoryStorageLike {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
  ) {}

  static fromEnv(env: {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    CLIENT_HISTORY_BUCKET?: string;
  }): WorkerHistoryStorage | undefined {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
    return new WorkerHistoryStorage(
      createSupabaseStorageClient({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      env.CLIENT_HISTORY_BUCKET ?? "ClientHistory",
    );
  }

  async upload(clientId: string, file: File): Promise<string> {
    await validateFile(file);
    await this.assertPrivateBucket();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `clients/historys/${clientId}/${crypto.randomUUID()}_${safeName}`;
    await this.storage.upload(this.bucket, objectPath, file, {
      contentType: file.type,
      upsert: false,
    });
    return objectPath;
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    await this.assertPrivateBucket();
    return this.storage.createSignedUrl(
      this.bucket,
      objectPath,
      HISTORY_FILE_SIGNED_URL_EXPIRES_IN_SECONDS,
    );
  }

  async download(objectPath: string): Promise<Response> {
    await this.assertPrivateBucket();
    return this.storage.download(this.bucket, objectPath);
  }

  async remove(objectPath: string): Promise<void> {
    await this.assertPrivateBucket();
    await this.storage.remove(this.bucket, objectPath);
  }

  private async assertPrivateBucket(): Promise<void> {
    const bucket = await this.storage.getBucket(this.bucket);
    if (bucket.public)
      throw new ServiceError(500, "Storage privado de históricos não configurado.");
  }
}
