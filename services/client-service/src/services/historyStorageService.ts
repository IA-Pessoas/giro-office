import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "@workspace/shared";

export interface HistoryFileStorage {
  saveObjectPath(
    clientId: string,
    file: { buffer: Buffer; mimetype: string; originalName: string },
  ): Promise<string>;
  createSignedAccessUrl(objectPath: string): Promise<string>;
}

/**
 * Armazenamento local (alternativa ao Firebase do legado). Caminho relativo guardado em `ClientHistory.file`.
 */
export class LocalHistoryFileStorage implements HistoryFileStorage {
  constructor(private readonly baseDir: string) {}

  async saveObjectPath(
    clientId: string,
    file: { buffer: Buffer; mimetype: string; originalName: string },
  ): Promise<string> {
    const safeName = file.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relative = `clients/historys/${clientId}/${Date.now()}_${safeName}`;
    const full = path.join(this.baseDir, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.buffer);
    return relative;
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    return objectPath;
  }
}

export class SupabaseHistoryFileStorage implements HistoryFileStorage {
  private readonly signedUrlExpiresInSeconds = 300;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async saveObjectPath(
    clientId: string,
    file: { buffer: Buffer; mimetype: string; originalName: string },
  ): Promise<string> {
    const safeName = file.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `clients/historys/${clientId}/${Date.now()}_${safeName}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new ServiceError(500, "Erro ao fazer upload da foto.", error);
    }

    return objectPath;
  }

  async createSignedAccessUrl(objectPath: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, this.signedUrlExpiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new ServiceError(500, "Erro ao gerar link do anexo.", error);
    }

    return data.signedUrl;
  }
}
