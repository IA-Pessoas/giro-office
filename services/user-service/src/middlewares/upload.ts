import multer from "multer";

import { ServiceError } from "@workspace/shared";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new ServiceError(400, "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP."));
    }
    cb(null, true);
  },
});
