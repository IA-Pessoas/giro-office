import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface EncryptedTextCryptoOptions {
  keyBase64: string;
  keyVersion: string;
}

export interface EncryptedTextCrypto {
  encrypt(value: string): string;
  decrypt(value: string): string;
  isEncrypted(value: string): boolean;
}

export function createEncryptedTextCrypto(
  options: EncryptedTextCryptoOptions,
): EncryptedTextCrypto {
  let key: Buffer;
  try {
    key = decodeBase64(options.keyBase64, "key");
  } catch (error: unknown) {
    throw new Error("Encrypted text key must be base64 with exactly 32 bytes.", {
      cause: error,
    });
  }

  if (key.length !== KEY_BYTES) {
    throw new Error("Encrypted text key must be base64 with exactly 32 bytes.");
  }

  const keyVersion = options.keyVersion.trim();
  if (!keyVersion) {
    throw new Error("Encrypted text key version must not be empty.");
  }

  return {
    encrypt(value: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

      return JSON.stringify({
        v: keyVersion,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      });
    },

    decrypt(value: string): string {
      const envelope = parseEncryptedTextEnvelope(value);
      if (envelope.v !== keyVersion) {
        throw new Error("Encrypted text envelope version mismatch.");
      }

      const decipher = createDecipheriv(ALGORITHM, key, envelope.iv);
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([decipher.update(envelope.data), decipher.final()]).toString("utf8");
    },

    isEncrypted(value: string): boolean {
      try {
        parseEncryptedTextEnvelope(value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

interface ParsedEncryptedTextEnvelope {
  v: string;
  iv: Buffer;
  tag: Buffer;
  data: Buffer;
}

function parseEncryptedTextEnvelope(value: string): ParsedEncryptedTextEnvelope {
  let payload: unknown;
  try {
    payload = JSON.parse(value);
  } catch {
    throw new Error("Invalid encrypted text envelope.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid encrypted text envelope.");
  }

  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.v !== "string" || !envelope.v.trim()) {
    throw new Error("Invalid encrypted text envelope.");
  }

  const iv = decodeBase64Field(envelope.iv, "iv");
  const tag = decodeBase64Field(envelope.tag, "tag");
  const data = decodeBase64Field(envelope.data, "data", true);

  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
    throw new Error("Invalid encrypted text envelope.");
  }

  return { v: envelope.v, iv, tag, data };
}

function decodeBase64Field(value: unknown, field: string, allowEmpty = false): Buffer {
  if (typeof value !== "string") {
    throw new Error(`Invalid encrypted text envelope ${field}.`);
  }

  const decoded = decodeBase64(value, field, allowEmpty);
  if (!allowEmpty && decoded.length === 0) {
    throw new Error(`Invalid encrypted text envelope ${field}.`);
  }

  return decoded;
}

function decodeBase64(value: string, field: string): Buffer;
function decodeBase64(value: string, field: string, allowEmpty: boolean): Buffer;
function decodeBase64(value: string, field: string, allowEmpty = false): Buffer {
  if (!BASE64_PATTERN.test(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid encrypted text ${field}.`);
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`Invalid encrypted text ${field}.`);
  }

  return decoded;
}
