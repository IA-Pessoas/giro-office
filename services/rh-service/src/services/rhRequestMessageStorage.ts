import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { error as logError, ServiceError } from "@workspace/shared";

interface SupabaseStorageClient {
  storage: {
    from(bucket: string): {
      upload(
        objectPath: string,
        data: Buffer,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: unknown | null }>;
      remove(objectPaths: string[]): Promise<{ error: unknown | null }>;
      createSignedUrl(
        objectPath: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl?: string } | null; error: unknown | null }>;
    };
  };
}

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
const nodeRequire = createRequire(import.meta.url);

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
    private readonly supabase: SupabaseStorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = randomUUID,
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
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(objectPath, input.file.buffer, {
          contentType: input.file.mimetype,
          upsert: false,
        });
      if (error) throw error;
      return objectPath;
    } catch (err: unknown) {
      logError("Erro ao armazenar anexo de mensagem RH", { err });
      throw new ServiceError(500, "Erro ao armazenar anexo da mensagem.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(objectPath, SIGNED_URL_EXPIRES_IN_SECONDS);
      if (error || !data?.signedUrl) {
        throw new ServiceError(500, "Erro ao gerar link do anexo da mensagem.", error);
      }
      return data.signedUrl;
    } catch (err: unknown) {
      logError("Erro ao gerar link assinado de mensagem RH", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar link do anexo da mensagem.", err);
    }
  }

  async remove(objectPath: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);
      if (error) throw error;
    } catch (err: unknown) {
      logError("Erro ao remover anexo de mensagem RH", { err, objectPath });
    }
  }
}

export function createSupabaseRhRequestMessageStorage(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string,
): SupabaseRhRequestMessageStorage {
  const { createClient } = nodeRequire("@supabase/supabase-js") as {
    createClient: (url: string, key: string) => SupabaseStorageClient;
  };
  return new SupabaseRhRequestMessageStorage(createClient(supabaseUrl, serviceRoleKey), bucket);
}

export class UnavailableRhRequestMessageStorage implements RhRequestMessageAttachmentStorage {
  async upload(
    _input: Parameters<RhRequestMessageAttachmentStorage["upload"]>[0],
  ): Promise<string> {
    throw new ServiceError(503, "Armazenamento de anexos de mensagens não configurado.");
  }

  async createSignedAccessUrl(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de anexos de mensagens não configurado.");
  }

  async remove(): Promise<void> {}
}
