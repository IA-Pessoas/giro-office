import multer from "multer";

import { ServiceError } from "../http/errors.js";

const DEFAULT_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PhotoUploadOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export function createPhotoUploadMiddleware(
  options?: PhotoUploadOptions,
): ReturnType<typeof multer> {
  const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes = options?.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter(_req, file, cb) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new ServiceError(400, "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP."));
      }
      cb(null, true);
    },
  });
}
