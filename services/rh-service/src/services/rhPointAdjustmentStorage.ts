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
      createSignedUrl(
        objectPath: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl?: string } | null; error: unknown | null }>;
    };
  };
}

export const RH_POINT_ADJUSTMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type RhPointAdjustmentMimeType = (typeof RH_POINT_ADJUSTMENT_MIME_TYPES)[number];

const EXTENSION_BY_MIME_TYPE: Record<(typeof RH_POINT_ADJUSTMENT_MIME_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const SIGNED_URL_EXPIRES_IN_SECONDS = 300;

const nodeRequire = createRequire(import.meta.url);

export interface RhPointAdjustmentAttachmentStorage {
  upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: RhPointAdjustmentMimeType };
  }): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

export function buildRhPointAdjustmentObjectPath(input: {
  organizationId: string;
  requestId: string;
  fileId: string;
  mimetype: RhPointAdjustmentMimeType;
}): string {
  return `rh/organizations/${input.organizationId}/point-adjustments/${input.requestId}/${input.fileId}.${EXTENSION_BY_MIME_TYPE[input.mimetype]}`;
}

export function isRhPointAdjustmentObjectPath(
  objectPath: string,
  organizationId: string,
  requestId: string,
): boolean {
  const prefix = `rh/organizations/${organizationId}/point-adjustments/${requestId}/`;
  const filename = objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/iu.test(
    filename,
  );
}

export class SupabaseRhPointAdjustmentStorage implements RhPointAdjustmentAttachmentStorage {
  constructor(
    private readonly supabase: SupabaseStorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = randomUUID,
  ) {}

  async upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: RhPointAdjustmentMimeType };
  }): Promise<string> {
    const objectPath = buildRhPointAdjustmentObjectPath({
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
      logError("Erro ao armazenar comprovante de ajuste de ponto", { err });
      throw new ServiceError(500, "Erro ao armazenar comprovante do ajuste de ponto.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(objectPath, SIGNED_URL_EXPIRES_IN_SECONDS);
      if (error || !data?.signedUrl) {
        throw new ServiceError(500, "Erro ao gerar link do comprovante de ajuste.", error);
      }
      return data.signedUrl;
    } catch (err: unknown) {
      logError("Erro ao gerar link assinado do comprovante de ajuste", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar link do comprovante de ajuste.", err);
    }
  }
}

export function createSupabaseRhPointAdjustmentStorage(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string,
): SupabaseRhPointAdjustmentStorage {
  const { createClient } = nodeRequire("@supabase/supabase-js") as {
    createClient: (url: string, key: string) => SupabaseStorageClient;
  };

  return new SupabaseRhPointAdjustmentStorage(createClient(supabaseUrl, serviceRoleKey), bucket);
}

export class UnavailableRhPointAdjustmentStorage implements RhPointAdjustmentAttachmentStorage {
  async upload(
    _input: Parameters<RhPointAdjustmentAttachmentStorage["upload"]>[0],
  ): Promise<string> {
    throw new ServiceError(503, "Armazenamento de comprovantes nao configurado.");
  }

  async createSignedAccessUrl(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de comprovantes nao configurado.");
  }
}
