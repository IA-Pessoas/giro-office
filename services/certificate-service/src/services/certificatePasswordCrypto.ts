import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { error as logError, ServiceError } from "@workspace/shared";

export interface CertificatePasswordCryptoOptions {
  keyBase64: string;
  keyVersion: string;
  /** Chave anterior, só para leitura dos envelopes migrados; aceita qualquer versão. */
  legacyKeyBase64?: string;
}

export interface CertificatePasswordCrypto {
  encrypt(value: string): string;
  decrypt(value: string): string;
}

type EncryptedTextPayload = {
  v: string;
  iv: string;
  tag: string;
  data: string;
};

const decryptionError = () =>
  new ServiceError(500, "Erro ao descriptografar senha de certificado.");

function isCanonicalBase64(value: string): boolean {
  return (
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function decodeBase64(value: string): Buffer {
  if (!isCanonicalBase64(value)) {
    throw decryptionError();
  }

  return Buffer.from(value, "base64");
}

function parseEncryptedTextPayload(value: string, keyVersion?: string): EncryptedTextPayload {
  try {
    const payload: unknown = JSON.parse(value);

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 4
    ) {
      throw decryptionError();
    }

    const candidate = payload as Record<string, unknown>;
    if (
      typeof candidate.v !== "string" ||
      typeof candidate.iv !== "string" ||
      typeof candidate.tag !== "string" ||
      typeof candidate.data !== "string" ||
      (keyVersion !== undefined && candidate.v !== keyVersion)
    ) {
      throw decryptionError();
    }

    return candidate as EncryptedTextPayload;
  } catch {
    throw decryptionError();
  }
}

function parseKey(keyBase64: string, envName: string): Buffer {
  const key = isCanonicalBase64(keyBase64) ? Buffer.from(keyBase64, "base64") : undefined;

  if (!key || key.length !== 32) {
    throw new ServiceError(500, `${envName} deve ter 32 bytes em base64.`);
  }

  return key;
}

function decryptWithKey(value: string, key: Buffer, keyVersion?: string): string {
  const payload = parseEncryptedTextPayload(value, keyVersion);
  const iv = decodeBase64(payload.iv);
  const tag = decodeBase64(payload.tag);
  const data = decodeBase64(payload.data);

  if (iv.length !== 12 || tag.length !== 16) {
    throw decryptionError();
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function createCertificatePasswordCrypto(
  options: CertificatePasswordCryptoOptions,
): CertificatePasswordCrypto {
  const key = parseKey(options.keyBase64, "CERTIFICATE_PASSWORD_ENCRYPTION_KEY");
  const legacyKey = options.legacyKeyBase64
    ? parseKey(options.legacyKeyBase64, "CERTIFICATE_PASSWORD_LEGACY_ENCRYPTION_KEY")
    : undefined;

  return {
    encrypt(value: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

      return JSON.stringify({
        v: options.keyVersion,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      } satisfies EncryptedTextPayload);
    },

    decrypt(value: string): string {
      try {
        return decryptWithKey(value, key, options.keyVersion);
      } catch {
        if (!legacyKey) throw decryptionError();
      }

      try {
        return decryptWithKey(value, legacyKey);
      } catch {
        throw decryptionError();
      }
    },
  };
}

/** Senha persistida em JSON é tratada como envelope cifrado; texto legado não-JSON fica em claro. */
export function isEncryptedPasswordPayload(value: string): boolean {
  try {
    JSON.parse(value.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Senha em claro para validar o arquivo enviado. `undefined` quando não há senha ou quando o
 * envelope não abre com as chaves configuradas; texto legado não cifrado volta como está.
 */
export function readStoredCertificatePassword(
  stored: string | null | undefined,
  crypto: CertificatePasswordCrypto | undefined,
): string | undefined {
  if (!stored) return undefined;
  if (!isEncryptedPasswordPayload(stored)) return stored;
  try {
    return crypto?.decrypt(stored);
  } catch (err: unknown) {
    logError("Senha de certificado ilegível; arquivo validado só pela estrutura", { err });
    return undefined;
  }
}
