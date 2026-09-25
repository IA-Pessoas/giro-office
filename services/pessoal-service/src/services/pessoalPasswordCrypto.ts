import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { ServiceError } from "@workspace/shared";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

type EncryptedTextPayload = {
  v: string;
  iv: string;
  tag: string;
  data: string;
};

export interface PessoalPasswordCrypto {
  encrypt(value: string | null | undefined): string | null;
  decrypt(value: string | null | undefined): string | null;
}

export function isPessoalPasswordEncrypted(value: string): boolean {
  try {
    parseEncryptedPayload(value);
    return true;
  } catch {
    return false;
  }
}

export function createPessoalPasswordCrypto(options: {
  keyBase64: string;
  keyVersion: string;
}): PessoalPasswordCrypto {
  const key = decodeKey(options.keyBase64);
  const keyVersion = options.keyVersion.trim();
  if (!keyVersion) {
    throw new ServiceError(500, "Versão da chave de criptografia de pessoal inválida.");
  }

  return {
    encrypt(value: string | null | undefined): string | null {
      if (value === null || value === undefined) {
        return null;
      }

      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const payload: EncryptedTextPayload = {
        v: keyVersion,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      };

      return JSON.stringify(payload);
    },

    decrypt(value: string | null | undefined): string | null {
      if (value === null || value === undefined) {
        return null;
      }

      try {
        const payload = parseEncryptedPayload(value);
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
        decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(payload.data, "base64")),
          decipher.final(),
        ]);

        return decrypted.toString("utf8");
      } catch (err: unknown) {
        throw new ServiceError(500, "Erro ao descriptografar senha de pessoal.", err);
      }
    },
  };
}

function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new ServiceError(500, "Chave de criptografia de pessoal inválida.");
  }

  return key;
}

function parseEncryptedPayload(value: string): EncryptedTextPayload {
  const payload = JSON.parse(value) as Partial<EncryptedTextPayload>;
  if (
    typeof payload.v !== "string" ||
    typeof payload.iv !== "string" ||
    typeof payload.tag !== "string" ||
    typeof payload.data !== "string"
  ) {
    throw new Error("Invalid encrypted payload");
  }

  return payload as EncryptedTextPayload;
}
