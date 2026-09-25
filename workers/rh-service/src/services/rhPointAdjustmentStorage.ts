import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { error as logError, ServiceError } from "@workspace/shared";

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

/** Mesmo contrato do Node, sobre o cliente REST do Supabase Storage de `@workspace/runtime`. */
export class SupabaseRhPointAdjustmentStorage implements RhPointAdjustmentAttachmentStorage {
  constructor(
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = () => crypto.randomUUID(),
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
      await this.storage.upload(this.bucket, objectPath, new Uint8Array(input.file.buffer), {
        contentType: input.file.mimetype,
        upsert: false,
      });
      return objectPath;
    } catch (err: unknown) {
      logError("Erro ao armazenar comprovante de ajuste de ponto", { err });
      throw new ServiceError(500, "Erro ao armazenar comprovante do ajuste de ponto.", err);
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
      logError("Erro ao gerar link assinado do comprovante de ajuste", { err });
      throw new ServiceError(500, "Erro ao gerar link do comprovante de ajuste.", err);
    }
  }
}

export class UnavailableRhPointAdjustmentStorage implements RhPointAdjustmentAttachmentStorage {
  async upload(
    _input: Parameters<RhPointAdjustmentAttachmentStorage["upload"]>[0],
  ): Promise<string> {
    throw new ServiceError(503, "Armazenamento de comprovantes não configurado.");
  }

  async createSignedAccessUrl(): Promise<string> {
    throw new ServiceError(503, "Armazenamento de comprovantes não configurado.");
  }
}

export function rhPointAdjustmentStorageFromEnv(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RH_POINT_ADJUSTMENT_BUCKET?: string;
}): RhPointAdjustmentAttachmentStorage {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new UnavailableRhPointAdjustmentStorage();
  }
  return new SupabaseRhPointAdjustmentStorage(
    createSupabaseStorageClient({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    env.RH_POINT_ADJUSTMENT_BUCKET ?? "rh-point-adjustments",
  );
}
