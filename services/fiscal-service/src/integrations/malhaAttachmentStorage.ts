import { ServiceError } from "@workspace/shared";
import type { SupabaseClient } from "@workspace/shared/storage";

import type { MalhaAttachmentStorage } from "../services/malhaService.js";

/** Bucket privado do Supabase para anexos das malhas; bucket público é recusado. */
export class SupabaseMalhaAttachmentStorage implements MalhaAttachmentStorage {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async upload(objectPath: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.assertPrivateBucket();
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(objectPath, bytes, { contentType, upsert: false });
    if (error) throw new ServiceError(500, "Erro ao armazenar anexo da malha.", error);
  }

  async remove(objectPath: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([objectPath]);
    if (error) throw new ServiceError(500, "Erro ao remover anexo da malha.", error);
  }

  async createSignedUrl(objectPath: string, expiresInSeconds: number): Promise<string> {
    await this.assertPrivateBucket();
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new ServiceError(500, "Erro ao gerar acesso ao anexo da malha.", error);
    }
    return data.signedUrl;
  }

  private async assertPrivateBucket(): Promise<void> {
    const { data, error } = await this.supabase.storage.getBucket(this.bucket);
    if (error || !data || data.public) {
      throw new ServiceError(500, "Storage privado de anexos fiscais não configurado.", error);
    }
  }
}
