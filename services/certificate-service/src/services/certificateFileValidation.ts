import path from "node:path";

import { ServiceError } from "@workspace/shared";

export const CERTIFICATE_FILE_MIME_TYPES = [
  "application/x-pkcs12",
  "application/pkcs12",
  "application/octet-stream",
] as const;

const certificateFileMimeTypeSet = new Set<string>(CERTIFICATE_FILE_MIME_TYPES);

export interface CertificateUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export function validateCertificateUploadFile(
  file: CertificateUploadFile | undefined,
  maxSizeBytes: number,
): CertificateUploadFile {
  if (!file) {
    throw new ServiceError(400, "Arquivo de certificado é obrigatório.");
  }

  if (file.buffer.length === 0 || file.size === 0) {
    throw new ServiceError(400, "Arquivo de certificado vazio.");
  }

  if (file.size > maxSizeBytes) {
    throw new ServiceError(400, "Arquivo de certificado excede o limite permitido.");
  }

  const extension = path.extname(file.originalname).toLowerCase();
  if (extension !== ".pfx" && extension !== ".p12") {
    throw new ServiceError(400, "Arquivo de certificado deve usar extensão .pfx ou .p12.");
  }

  if (!certificateFileMimeTypeSet.has(file.mimetype)) {
    throw new ServiceError(400, "Tipo de arquivo de certificado não permitido.");
  }

  return file;
}
