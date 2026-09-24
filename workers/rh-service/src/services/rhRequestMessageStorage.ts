// Porte de services/rh-service/src/services/rhRequestMessageStorage.ts: mesmo contrato,
// mas via Supabase Storage REST (`@workspace/runtime`) em vez de `@supabase/supabase-js`.
import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { error as logError, ServiceError } from "@workspace/shared";

export const RH_REQUEST_MESSAGE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type RhRequestMessageMimeType = (typeof RH_REQUEST_MESSAGE_MIME_TYPES)[number];

const EXTENSION_BY_MIME_TYPE: Record<RhRequestMessageMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const SIGNED_URL_EXPIRES_IN_SECONDS = 300;

export interface RhRequestMessageAttachmentStorage {
  upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: RhRequestMessageMimeType };
  }): Promise<string>;
  remove(objectPath: string): Promise<void>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

export function buildRhRequestMessageObjectPath(input: {
  organizationId: string;
  requestId: string;
  fileId: string;
  mimetype: RhRequestMessageMimeType;
}): string {
  return `rh/organizations/${input.organizationId}/request-messages/${input.requestId}/${input.fileId}.${EXTENSION_BY_MIME_TYPE[input.mimetype]}`;
}

export function isRhRequestMessageObjectPath(
  objectPath: string,
  organizationId: string,
  requestId: string,
): boolean {
  const prefix = `rh/organizations/${organizationId}/request-messages/${requestId}/`;
  const filename = objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png)$/iu.test(
    filename,
  );
}

export class SupabaseRhRequestMessageStorage implements RhRequestMessageAttachmentStorage {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = () => crypto.randomUUID(),
  ) {}

  async upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: RhRequestMessageMimeType };
  }): Promise<string> {
    const objectPath = buildRhRequestMessageObjectPath({
      organizationId: input.organizationId,
      requestId: input.requestId,
      fileId: this.createFileId(),
      mimetype: input.file.mimetype,
    });

    try {
      await this.storage.upload(this.bucket, objectPath, new Uint8Array(input.file.buffer), {
        contentType: input.file.mimetype,
        upsert: false,
      });
      return objectPath;
    } catch (err: unknown) {
      logError("Erro ao armazenar anexo de mensagem RH", { err });
      throw new ServiceError(500, "Erro ao armazenar anexo da mensagem.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    try {
      return await this.storage.createSignedUrl(
        this.bucket,
        objectPath,
        SIGNED_URL_EXPIRES_IN_SECONDS,
      );
    } catch (err: unknown) {
      logError("Erro ao gerar link assinado de mensagem RH", { err });
      throw new ServiceError(500, "Erro ao gerar link do anexo da mensagem.", err);
    }
  }

  async remove(objectPath: string): Promise<void> {
    try {
      await this.storage.remove(this.bucket, objectPath);
    } catch (err: unknown) {
      logError("Erro ao remover anexo de mensagem RH", { err, objectPath });
    }
  }
}

export class UnavailableRhRequestMessageStorage implements RhRequestMessageAttachmentStorage {
  async upload(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de anexos de mensagens não configurado.");
  }

  async createSignedAccessUrl(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de anexos de mensagens não configurado.");
  }

  async remove(): Promise<void> {}
}

export function rhRequestMessageStorageFromEnv(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RH_REQUEST_MESSAGE_BUCKET?: string;
}): RhRequestMessageAttachmentStorage {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new UnavailableRhRequestMessageStorage();
  }
  return new SupabaseRhRequestMessageStorage(
    createSupabaseStorageClient({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    env.RH_REQUEST_MESSAGE_BUCKET ?? "rh-request-messages",
  );
}
