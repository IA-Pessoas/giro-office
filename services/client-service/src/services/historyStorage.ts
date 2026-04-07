import fs from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPhoto } from "@workspace/shared/storage";

export interface HistoryFileStorage {
  saveObjectPath(
    clientId: string,
    file: { buffer: Buffer; mimetype: string; originalName: string },
  ): Promise<string>;
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
}

export class SupabaseHistoryFileStorage implements HistoryFileStorage {
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

    return uploadPhoto(
      this.supabase,
      objectPath,
      { buffer: file.buffer, mimetype: file.mimetype },
      { bucket: this.bucket },
    );
  }
}
