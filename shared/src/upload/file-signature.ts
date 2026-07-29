import { ServiceError } from "../http/errors.js";

export interface UploadFileForSignatureValidation {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

const ZIP_BASED_OFFICE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer: Buffer, value: string, offset = 0): boolean {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

function hasValidTextContent(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

function hasValidSignature(file: UploadFileForSignatureValidation): boolean {
  const { buffer, mimetype } = file;

  if (buffer.length === 0) {
    return false;
  }

  if (mimetype === "image/jpeg") {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  }

  if (mimetype === "image/png") {
    return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimetype === "image/webp") {
    return (
      buffer.length >= 12 && startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WEBP", 8)
    );
  }

  if (mimetype === "application/pdf") {
    return startsWithAscii(buffer, "%PDF-");
  }

  if (mimetype === "application/msword") {
    return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }

  if (mimetype === "application/vnd.ms-excel") {
    return startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }

  if (ZIP_BASED_OFFICE_MIME_TYPES.has(mimetype)) {
    return startsWithAscii(buffer, "PK\x03\x04");
  }

  if (mimetype === "text/plain" || mimetype === "text/csv") {
    return hasValidTextContent(buffer);
  }

  return true;
}

export function validateUploadFileSignature(file: UploadFileForSignatureValidation): void {
  if (!hasValidSignature(file)) {
    throw new ServiceError(400, "Assinatura do arquivo não corresponde ao tipo informado.");
  }
}

export function validateOptionalUploadFileSignature(
  file: UploadFileForSignatureValidation | undefined,
): void {
  if (file) {
    validateUploadFileSignature(file);
  }
}
