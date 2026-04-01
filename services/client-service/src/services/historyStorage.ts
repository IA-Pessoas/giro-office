import fs from "node:fs/promises";
import path from "node:path";

export interface HistoryFileStorage {
  saveObjectPath(clientId: string, originalName: string, buffer: Buffer): Promise<string>;
}

/**
 * Armazenamento local (alternativa ao Firebase do legado). Caminho relativo guardado em `ClientHistory.file`.
 */
export class LocalHistoryFileStorage implements HistoryFileStorage {
  constructor(private readonly baseDir: string) {}

  async saveObjectPath(clientId: string, originalName: string, buffer: Buffer): Promise<string> {
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relative = `clients/historys/${clientId}/${Date.now()}_${safeName}`;
    const full = path.join(this.baseDir, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return relative;
  }
}
