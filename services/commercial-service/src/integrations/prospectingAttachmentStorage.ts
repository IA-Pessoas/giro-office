import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { error as logError, ServiceError } from "@workspace/shared";

const EXTENSION_BY_MIME_TYPE = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
} as const;

export type ProspectingAttachmentMimeType = keyof typeof EXTENSION_BY_MIME_TYPE;
export const PROSPECTING_ATTACHMENT_MIME_TYPES = Object.keys(
  EXTENSION_BY_MIME_TYPE,
) as ProspectingAttachmentMimeType[];

export interface ProspectingAttachmentStorage {
  upload(input: {
    organizationId: string;
    prospectingId: string;
    file: { buffer: Buffer; mimetype: ProspectingAttachmentMimeType };
  }): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
  remove(objectPath: string): Promise<void>;
}

export class SupabaseProspectingAttachmentStorage implements ProspectingAttachmentStorage {
  private bucketVerification: Promise<void> | undefined;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket = "CommercialProspectingPrivate",
    private readonly createId: () => string = randomUUID,
  ) {}

  async upload(input: {
    organizationId: string;
    prospectingId: string;
    file: { buffer: Buffer; mimetype: ProspectingAttachmentMimeType };
  }): Promise<string> {
    await this.ensurePrivateBucket();
    const extension = EXTENSION_BY_MIME_TYPE[input.file.mimetype];
    const objectPath = `comercial/organizations/${input.organizationId}/prospecting/${input.prospectingId}/${this.createId()}.${extension}`;
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
      logError("Erro ao armazenar anexo de prospecção", { err });
      throw new ServiceError(500, "Não foi possível armazenar o anexo da prospecção.", err);
    }
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    await this.ensurePrivateBucket();
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, 300);
    if (error || !data?.signedUrl) {
      logError("Erro ao criar acesso assinado para anexo comercial", { err: error });
      throw new ServiceError(503, "Não foi possível acessar o anexo da prospecção.", error);
    }
    return data.signedUrl;
  }

  async remove(objectPath: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);
    if (error) {
      logError("Erro ao remover anexo substituído de prospecção", { err: error });
      throw new ServiceError(500, "Não foi possível remover o anexo anterior.", error);
    }
  }

  private async ensurePrivateBucket(): Promise<void> {
    this.bucketVerification ??= this.verifyPrivateBucket();
    try {
      await this.bucketVerification;
    } catch (err: unknown) {
      this.bucketVerification = undefined;
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(503, "Anexos comerciais indisponíveis no momento.", err);
    }
  }

  private async verifyPrivateBucket(): Promise<void> {
    const { data, error } = await this.supabase.storage.getBucket(this.bucket);
    if (error || !data || data.public) {
      throw new ServiceError(503, "O bucket de anexos comerciais deve ser privado.", error);
    }
  }
}
