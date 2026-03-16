import { error as logError, ServiceError } from "@workspace/shared";

import { supabase } from "../integrations/supabase.js";

const BUCKET = "Fotos";

class StorageService {
  async uploadUserPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    const ext = file.originalname.split(".").pop() ?? "jpg";
    const filePath = `${userId}/photo.${ext}`;

    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (error) {
        logError("Supabase storage upload error", { err: error });
        throw new ServiceError(500, "Erro ao fazer upload da foto.");
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      logError("Erro inesperado no upload de foto", { err });
      throw new ServiceError(500, "Erro ao fazer upload da foto.", err);
    }
  }

  async deleteUserPhoto(userId: string): Promise<void> {
    try {
      const { data: files } = await supabase.storage
        .from(BUCKET)
        .list(userId);

      if (!files || files.length === 0) return;

      const paths = files.map((f) => `${userId}/${f.name}`);

      const { error } = await supabase.storage
        .from(BUCKET)
        .remove(paths);

      if (error) {
        logError("Supabase storage delete error", { err: error });
        throw new ServiceError(500, "Erro ao remover foto do usuário.");
      }
    } catch (err: unknown) {
      if (err instanceof ServiceError) throw err;
      logError("Erro inesperado ao remover foto", { err });
      throw new ServiceError(500, "Erro ao remover foto do usuário.", err);
    }
  }
}

export { StorageService };
