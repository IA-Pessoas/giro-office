import { argon2id, argon2Verify, bcryptVerify } from "hash-wasm";

const ARGON2ID_OPTIONS = {
  iterations: 2,
  memorySize: 19 * 1024,
  parallelism: 1,
  hashLength: 32,
  outputType: "encoded" as const,
};
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/u;

export function isLegacyBcryptHash(hash: string): boolean {
  return BCRYPT_HASH_PATTERN.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({ password, salt, ...ARGON2ID_OPTIONS });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2id$")) {
      return await argon2Verify({ password, hash });
    }
    if (isLegacyBcryptHash(hash)) {
      return await bcryptVerify({ password, hash });
    }
  } catch {
    return false;
  }
  return false;
}
