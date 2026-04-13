import { deletePhotosByPrefix, uploadPhoto } from "@workspace/shared/storage";

import { supabase } from "../integrations/supabase.js";

const BUCKET = "Fotos";

class StorageService {
  async uploadUserPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    const ext = file.originalname.split(".").pop() ?? "jpg";
    const filePath = `${userId}/photo.${ext}`;
    return uploadPhoto(supabase, filePath, file, { bucket: BUCKET });
  }

  async deleteUserPhoto(userId: string): Promise<void> {
    await deletePhotosByPrefix(supabase, userId, { bucket: BUCKET });
  }
}

export { StorageService };
