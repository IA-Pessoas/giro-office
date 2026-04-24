import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { ServiceError, warn as logWarn } from "@workspace/shared";
import { deletePhotosByPrefix, uploadPhoto } from "@workspace/shared/storage";

import { getUserServiceEnv, type UserServiceEnv } from "../config/env.js";

const BUCKET = "Fotos";

export type UserPhotoReadResult =
  | { kind: "file"; buffer: Buffer; contentType: string }
  | { kind: "redirect"; url: string };

function contentTypeFromPhotoPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

/**
 * Returns the effective storage mode.
 * Falls back to "local" when configured as "supabase" but the service role key
 * doesn't look like a valid JWT (i.e. doesn't start with "eyJ"). This protects
 * against PAT-style keys (sb_secret_*) that pass schema validation but fail at
 * runtime inside the Supabase client.
 */
function resolveStorageMode(env: UserServiceEnv): "supabase" | "local" {
  if (env.photoStorageMode !== "supabase") return "local";
  const keyIsJwt = env.supabaseServiceRoleKey.startsWith("eyJ");
  if (!keyIsJwt) {
    logWarn(
      "SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT — falling back to local photo storage. " +
        "Provide a service role key (eyJ...) from your Supabase project dashboard to enable cloud storage.",
      {},
    );
    return "local";
  }
  return "supabase";
}

class StorageService {
  readonly #env: UserServiceEnv;
  readonly #mode: "supabase" | "local";

  constructor(env: UserServiceEnv = getUserServiceEnv()) {
    this.#env = env;
    this.#mode = resolveStorageMode(env);
  }

  async uploadUserPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    const ext = file.originalname.split(".").pop() ?? "jpg";
    const filePath = `${userId}/photo.${ext}`;

    if (this.#mode === "local") {
      const relativePath = path.join("users", filePath);
      const fullPath = path.join(this.#env.photoStorageDir, relativePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.buffer);
      return relativePath;
    }

    const supabase = createClient(this.#env.supabaseUrl, this.#env.supabaseServiceRoleKey);
    return uploadPhoto(supabase, filePath, file, { bucket: BUCKET });
  }

  /**
   * URL absoluta (ex.: Supabase) → redirect; caminho relativo (armazenamento local) → bytes em disco.
   */
  async readUserPhoto(
    userId: string,
    photoUrl: string | null | undefined,
  ): Promise<UserPhotoReadResult | null> {
    if (!photoUrl?.trim()) return null;
    const trimmed = photoUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return { kind: "redirect", url: trimmed };
    }

    if (this.#mode !== "local") {
      return null;
    }

    const baseDir = path.resolve(this.#env.photoStorageDir, "users", userId);
    const fullPath = path.resolve(this.#env.photoStorageDir, trimmed);
    const relativeToBase = path.relative(baseDir, fullPath);
    if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
      throw new ServiceError(400, "Caminho de foto invalido.");
    }

    try {
      const buffer = await fs.readFile(fullPath);
      return { kind: "file", buffer, contentType: contentTypeFromPhotoPath(fullPath) };
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") return null;
      logWarn("Erro ao ler foto local do usuario", { userId, err });
      throw new ServiceError(500, "Erro ao ler a foto do usuario.");
    }
  }

  async deleteUserPhoto(userId: string): Promise<void> {
    if (this.#mode === "local") {
      const fullPath = path.join(this.#env.photoStorageDir, "users", userId);
      await fs.rm(fullPath, { recursive: true, force: true });
      return;
    }

    const supabase = createClient(this.#env.supabaseUrl, this.#env.supabaseServiceRoleKey);
    await deletePhotosByPrefix(supabase, userId, { bucket: BUCKET });
  }
}

export { StorageService };
