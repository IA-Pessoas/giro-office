import type { RequestHandler } from "express";
import multer from "multer";

import { ServiceError } from "../http/errors.js";

const DEFAULT_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PhotoUploadOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${bytes} bytes`;
}

function normalizeUploadError(err: unknown, maxSizeBytes: number): unknown {
  if (!(err instanceof multer.MulterError)) {
    return err;
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return new ServiceError(413, `A imagem deve ter no máximo ${formatSize(maxSizeBytes)}.`);
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return new ServiceError(400, "Campo de arquivo inesperado.");
  }

  return new ServiceError(400, "Upload de arquivo inválido.");
}

function wrapUploadMiddleware(middleware: RequestHandler, maxSizeBytes: number): RequestHandler {
  return (request, response, next) => {
    middleware(request, response, (err) => {
      next(err ? normalizeUploadError(err, maxSizeBytes) : undefined);
    });
  };
}

export function createPhotoUploadMiddleware(
  options?: PhotoUploadOptions,
): ReturnType<typeof multer> {
  const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes = options?.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter(_req, file, cb) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new ServiceError(400, "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP."));
      }
      cb(null, true);
    },
  });

  const originalSingle = upload.single.bind(upload);
  upload.single = (fieldName: string) =>
    wrapUploadMiddleware(originalSingle(fieldName), maxSizeBytes);

  return upload;
}
