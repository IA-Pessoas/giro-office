import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export const MAX_CHAT_MEDIA_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const chatMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CHAT_MEDIA_FILE_SIZE_BYTES },
});

export function uploadChatMedia(request: Request, response: Response, next: NextFunction): void {
  chatMediaUpload.single("file")(request, response, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      response.status(400).json({ error: "Arquivo excede o limite de 10 MB." });
      return;
    }

    if (err instanceof multer.MulterError) {
      response.status(400).json({ error: "Upload de mídia inválido." });
      return;
    }

    next(err);
  });
}
