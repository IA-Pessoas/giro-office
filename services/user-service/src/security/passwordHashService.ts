import argon2 from "argon2";
import bcrypt from "bcryptjs";

export const PASSWORD_HASH_VERSION = "argon2id-v1";

const ARGON2ID_OPTIONS = {
  type: argon2.argon2id as 2,
  version: 0x13,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export interface PasswordVerification {
  valid: boolean;
  needsRehash: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<PasswordVerification> {
  try {
    if (hash.startsWith("$argon2id$")) {
      return { valid: await argon2.verify(hash, password), needsRehash: false };
    }

    if (BCRYPT_HASH_PATTERN.test(hash)) {
      const valid = await bcrypt.compare(password, hash);
      return { valid, needsRehash: valid };
    }
  } catch {
    // Hashes inválidos nunca autenticam.
  }

  return { valid: false, needsRehash: false };
}
