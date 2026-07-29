import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { error as logError, ServiceError } from "@workspace/shared";

const IMAGE_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

const SIGNED_URL_EXPIRES_IN_SECONDS = 300;

export interface TiRequestImageUploadInput {
  organizationId: string;
  requestId: string;
  file: {
    buffer: Buffer;
    mimetype: keyof typeof IMAGE_EXTENSION_BY_MIME_TYPE;
  };
}

export interface TiRequestImageStorage {
  upload(input: TiRequestImageUploadInput): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

export interface BuildTiRequestImageObjectPathInput {
  organizationId: string;
  requestId: string;
  fileId: string;
  mimetype: keyof typeof IMAGE_EXTENSION_BY_MIME_TYPE;
}

export function buildTiRequestImageObjectPath(input: BuildTiRequestImageObjectPathInput): string {
  const extension = IMAGE_EXTENSION_BY_MIME_TYPE[input.mimetype];

  return `ti/organizations/${input.organizationId}/requests/${input.requestId}/${input.fileId}.${extension}`;
}

export function isTiRequestImageObjectPath(
  objectPath: string,
  organizationId: string,
  requestId: string,
): boolean {
  const prefix = `ti/organizations/${organizationId}/requests/${requestId}/`;
  const fileName = objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : "";

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(
    fileName,
  );
}

export class SupabaseTiRequestImageStorage implements TiRequestImageStorage {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = randomUUID,
  ) {}

  async upload(input: TiRequestImageUploadInput): Promise<string> {
    const objectPath = buildTiRequestImageObjectPath({
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

      if (error) {
        throw error;
      }

      return objectPath;
    } catch (err: unknown) {
      logError("Erro ao armazenar imagem de chamado de TI", { err });
      throw new ServiceError(500, "Erro ao armazenar imagem do chamado de TI.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(objectPath, SIGNED_URL_EXPIRES_IN_SECONDS);

      if (error || !data?.signedUrl) {
        throw new ServiceError(500, "Erro ao gerar link da imagem do chamado de TI.", error);
      }

      return data.signedUrl;
    } catch (err: unknown) {
      logError("Erro ao gerar link assinado de imagem de chamado de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao gerar link da imagem do chamado de TI.", err);
    }
  }
}
