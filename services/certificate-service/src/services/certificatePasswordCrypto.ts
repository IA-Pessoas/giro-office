import { ServiceError } from "@workspace/shared";
import { createEncryptedTextCrypto, type EncryptedTextCrypto } from "@workspace/shared/security";

export interface CertificatePasswordCrypto {
  encrypt(value: string | null | undefined): string | null;
  decrypt(value: string | null | undefined): string | null;
  isEncrypted(value: string): boolean;
}

export interface CertificatePasswordCryptoOptions {
  keyBase64: string;
  keyVersion: string;
}

const INVALID_PASSWORD_MESSAGE = "Senha de certificado invalida ou nao pode ser descriptografada.";

export function createCertificatePasswordCrypto(
  options: CertificatePasswordCryptoOptions,
): CertificatePasswordCrypto {
  const keyVersion = options.keyVersion.trim();
  if (!keyVersion) {
    throw new ServiceError(500, "CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION invalida.");
  }

  let crypto: EncryptedTextCrypto;
  try {
    crypto = createEncryptedTextCrypto({
      keyBase64: options.keyBase64,
      keyVersion,
    });
  } catch (error: unknown) {
    throw new ServiceError(
      500,
      "CERTIFICATE_PASSWORD_ENCRYPTION_KEY deve ser base64 com 32 bytes.",
      error,
    );
  }

  return {
    encrypt(value) {
      if (value === null || value === undefined) {
        return null;
      }

      return crypto.encrypt(value);
    },

    decrypt(value) {
      if (value === null || value === undefined) {
        return null;
      }

      try {
        return crypto.decrypt(value);
      } catch (error: unknown) {
        throw new ServiceError(422, INVALID_PASSWORD_MESSAGE, error);
      }
    },

    isEncrypted(value) {
      return crypto.isEncrypted(value);
    },
  };
}
