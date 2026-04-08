import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const DELIMITER = ":";

export class EncryptionService {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64");
    if (this.#key.length !== 32) {
      throw new Error(
        "MTK_ENCRYPTION_KEY invalida. A chave precisa ter 32 bytes em base64 para AES-256-GCM.",
      );
    }
  }

  encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.#key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}${DELIMITER}${authTag}${DELIMITER}${encrypted}`;
  }

  decrypt(hash: string): string {
    const parts = hash.split(DELIMITER);
    if (parts.length !== 3) {
      throw new Error("Hash de descriptografia invalido.");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");

    const decipher = createDecipheriv(ALGORITHM, this.#key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(parts[2], "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}
