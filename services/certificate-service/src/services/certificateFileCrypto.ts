import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { ServiceError } from "@workspace/shared";

export interface CertificateFileCryptoOptions {
  keyBase64: string;
  keyVersion: string;
}

export interface EncryptedCertificateFile {
  encryptedBuffer: Buffer;
  ivBase64: string;
  authTagBase64: string;
  sha256: string;
  keyVersion: string;
}

export interface DecryptCertificateFileInput {
  encryptedBuffer: Buffer;
  ivBase64: string;
  authTagBase64: string;
}

export function decodeCertificateEncryptionKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");

  if (key.length !== 32) {
    throw new ServiceError(500, "CERTIFICATE_FILE_ENCRYPTION_KEY deve ser base64 com 32 bytes.");
  }

  return key;
}

export function createCertificateFileCrypto(options: CertificateFileCryptoOptions): {
  encrypt(originalBuffer: Buffer): EncryptedCertificateFile;
  decrypt(input: DecryptCertificateFileInput): Buffer;
} {
  const key = decodeCertificateEncryptionKey(options.keyBase64);

  return {
    encrypt(originalBuffer: Buffer): EncryptedCertificateFile {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encryptedBuffer = Buffer.concat([cipher.update(originalBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const sha256 = createHash("sha256").update(originalBuffer).digest("hex");

      return {
        encryptedBuffer,
        ivBase64: iv.toString("base64"),
        authTagBase64: authTag.toString("base64"),
        sha256,
        keyVersion: options.keyVersion,
      };
    },

    decrypt(input: DecryptCertificateFileInput): Buffer {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.ivBase64, "base64"));
      decipher.setAuthTag(Buffer.from(input.authTagBase64, "base64"));

      return Buffer.concat([decipher.update(input.encryptedBuffer), decipher.final()]);
    },
  };
}
