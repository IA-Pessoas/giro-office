import { createSupabaseStorageClient, type SupabaseStorageClient } from "@workspace/runtime";
import { error as logError, ServiceError } from "@workspace/shared";

export const RH_NITRO_HOURS_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type NitroHoursMimeType = (typeof RH_NITRO_HOURS_MIME_TYPES)[number];

export interface NitroHoursCertificateStorage {
  upload(input: {
    organizationId: string;
    requestId: string;
    file: { buffer: Buffer; mimetype: NitroHoursMimeType };
  }): Promise<string>;
  createSignedAccessUrl(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}

const EXTENSION: Record<NitroHoursMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const SIGNED_URL_TTL_SECONDS = 300;

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
    private readonly storage: SupabaseStorageClient,
    private readonly bucket: string,
    private readonly createFileId: () => string = () => crypto.randomUUID(),
  ) {}

  private async assertPrivateBucket(): Promise<void> {
    const bucket = await this.storage.getBucket(this.bucket);
    if (bucket.public) {
      throw new ServiceError(503, "O bucket de certificados Nitro deve ser privado.");
    }
  }

  async upload(input: Parameters<NitroHoursCertificateStorage["upload"]>[0]): Promise<string> {
    const path = buildNitroHoursCertificatePath({
      organizationId: input.organizationId,
      requestId: input.requestId,
      fileId: this.createFileId(),
      mimetype: input.file.mimetype,
    });
    try {
      await this.assertPrivateBucket();
      await this.storage.upload(this.bucket, path, new Uint8Array(input.file.buffer), {
        contentType: input.file.mimetype,
        upsert: false,
      });
      return path;
    } catch (err: unknown) {
      logError("Erro ao armazenar certificado de horas Nitro", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível armazenar o certificado de horas.", err);
    }
  }

  async createSignedAccessUrl(path: string): Promise<string> {
    try {
      await this.assertPrivateBucket();
      return await this.storage.createSignedUrl(this.bucket, path, SIGNED_URL_TTL_SECONDS);
    } catch (err: unknown) {
      logError("Erro ao gerar acesso assinado ao certificado de horas Nitro", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Não foi possível acessar o certificado de horas.", err);
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await this.storage.remove(this.bucket, path);
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

export function nitroHoursStorageFromEnv(env: {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RH_NITRO_HOURS_BUCKET?: string;
}): NitroHoursCertificateStorage {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new UnavailableNitroHoursCertificateStorage();
  }
  return new SupabaseNitroHoursCertificateStorage(
    createSupabaseStorageClient({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    }),
    env.RH_NITRO_HOURS_BUCKET ?? "rh-nitro-hours",
  );
}
