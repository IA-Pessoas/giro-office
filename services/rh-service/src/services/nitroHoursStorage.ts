import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { error as logError, ServiceError } from "@workspace/shared";

interface StorageClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        data: Buffer,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: unknown | null }>;
      remove(paths: string[]): Promise<{ error: unknown | null }>;
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl?: string } | null; error: unknown | null }>;
    };
  };
}

export const RH_NITRO_HOURS_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type NitroHoursMimeType = (typeof RH_NITRO_HOURS_MIME_TYPES)[number];

export interface NitroHoursCertificateStorage {
  upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: NitroHoursMimeType };
  }): Promise<string>;
  remove(path: string): Promise<void>;
  createSignedAccessUrl(path: string): Promise<string>;
}

const EXTENSION: Record<NitroHoursMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const SIGNED_URL_TTL_SECONDS = 300;
const nodeRequire = createRequire(import.meta.url);

export function buildNitroHoursCertificatePath(input: {
  organizationId: string;
  requestId: string;
  fileId: string;
  mimetype: NitroHoursMimeType;
}): string {
  return `rh/organizations/${input.organizationId}/nitro-hours/${input.requestId}/${input.fileId}.${EXTENSION[input.mimetype]}`;
}

export class SupabaseNitroHoursCertificateStorage implements NitroHoursCertificateStorage {
  constructor(
    private readonly client: StorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = randomUUID,
  ) {}

  async upload(input: Parameters<NitroHoursCertificateStorage["upload"]>[0]): Promise<string> {
    const path = buildNitroHoursCertificatePath({
      organizationId: input.organizationId,
      requestId: input.requestId,
      fileId: this.createFileId(),
      mimetype: input.file.mimetype,
    });
    try {
      const { error } = await this.client.storage
        .from(this.bucket)
        .upload(path, input.file.buffer, {
          contentType: input.file.mimetype,
          upsert: false,
        });
      if (error) throw error;
      return path;
    } catch (err: unknown) {
      logError("Erro ao armazenar certificado de horas Nitro", { err });
      throw new ServiceError(500, "Não foi possível armazenar o certificado de horas.", err);
    }
  }

  async createSignedAccessUrl(path: string): Promise<string> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) throw error ?? new Error("URL assinada indisponível.");
      return data.signedUrl;
    } catch (err: unknown) {
      logError("Erro ao gerar acesso assinado ao certificado de horas Nitro", { err });
      throw new ServiceError(500, "Não foi possível acessar o certificado de horas.", err);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      const { error } = await this.client.storage.from(this.bucket).remove([path]);
      if (error) throw error;
    } catch (err: unknown) {
      logError("Erro ao remover certificado Nitro não vinculado", { err });
    }
  }
}

export class UnavailableNitroHoursCertificateStorage implements NitroHoursCertificateStorage {
  async upload(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de certificados Nitro não configurado.");
  }

  async createSignedAccessUrl(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de certificados Nitro não configurado.");
  }

  async remove(): Promise<void> {}
}

export function createSupabaseNitroHoursCertificateStorage(
  url: string,
  key: string,
  bucket: string,
) {
  const { createClient } = nodeRequire("@supabase/supabase-js") as {
    createClient: (url: string, key: string) => StorageClient;
  };
  return new SupabaseNitroHoursCertificateStorage(createClient(url, key), bucket);
}
