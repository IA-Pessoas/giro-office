import { createClient } from "@supabase/supabase-js";
import { deletePhotosByPrefix, uploadPhoto } from "@workspace/shared/storage";

import { getUserServiceEnv, type UserServiceEnv } from "../config/env.js";

const BUCKET = "Fotos";

class StorageService {
  readonly #env: UserServiceEnv;

  constructor(env: UserServiceEnv = getUserServiceEnv()) {
    this.#env = env;
  }

  #client() {
    return createClient(this.#env.supabaseUrl, this.#env.supabaseServiceRoleKey);
  }

  async uploadUserPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    const ext = file.originalname.split(".").pop() ?? "jpg";
    const filePath = `${userId}/photo.${ext}`;
    return uploadPhoto(this.#client(), filePath, file, { bucket: BUCKET });
  }

  /**
   * URL pública armazenada em `photo_url` (ex.: Supabase `getPublicUrl`), ou `null` se vazio / não for `http(s)`.
   */
  readUserPhoto(photoUrl: string | null | undefined): string | null {
    if (!photoUrl?.trim()) return null;
    const trimmed = photoUrl.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }

  async deleteUserPhoto(userId: string): Promise<void> {
    await deletePhotosByPrefix(this.#client(), userId, { bucket: BUCKET });
  }
}

export { StorageService };
