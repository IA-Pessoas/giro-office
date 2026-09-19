import type { RequestHandler } from "express";
import multer from "multer";

import { ServiceError } from "../http/errors.js";

const DEFAULT_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PhotoUploadOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export interface MemoryUploadOptions extends PhotoUploadOptions {
  maxSizeErrorMessage: string;
  mimeTypeErrorMessage: string;
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${bytes} bytes`;
}

function normalizeUploadError(
  err: unknown,
  maxSizeBytes: number,
  maxSizeErrorMessage?: string,
): unknown {
  if (!(err instanceof multer.MulterError)) {
    return err;
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return new ServiceError(
      413,
      maxSizeErrorMessage ?? `A imagem deve ter no máximo ${formatSize(maxSizeBytes)}.`,
    );
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return new ServiceError(400, "Campo de arquivo inesperado.");
  }

  return new ServiceError(400, "Upload de arquivo inválido.");
}

function wrapUploadMiddleware(
  middleware: RequestHandler,
  maxSizeBytes: number,
  maxSizeErrorMessage?: string,
): RequestHandler {
  return (request, response, next) => {
    middleware(request, response, (err) => {
      next(err ? normalizeUploadError(err, maxSizeBytes, maxSizeErrorMessage) : undefined);
    });
  };
}

export function createMemoryUploadMiddleware(
  options: MemoryUploadOptions,
): ReturnType<typeof multer> {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter(_req, file, cb) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new ServiceError(400, options.mimeTypeErrorMessage));
      }
      cb(null, true);
    },
  });

  const originalSingle = upload.single.bind(upload);
  upload.single = (fieldName: string) =>
    wrapUploadMiddleware(originalSingle(fieldName), maxSizeBytes, options.maxSizeErrorMessage);

  return upload;
}

export function createPhotoUploadMiddleware(
  options?: PhotoUploadOptions,
): ReturnType<typeof multer> {
  return createMemoryUploadMiddleware({
    maxSizeBytes: options?.maxSizeBytes,
    allowedMimeTypes: options?.allowedMimeTypes,
    maxSizeErrorMessage: `A imagem deve ter no máximo ${formatSize(options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES)}.`,
    mimeTypeErrorMessage: "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.",
  });
}
