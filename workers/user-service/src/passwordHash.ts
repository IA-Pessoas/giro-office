import { argon2idAsync } from "@noble/hashes/argon2";
import bcrypt from "bcryptjs";

// JS puro de proposito: o workerd proibe compilar WebAssembly em tempo de execucao
// ("Wasm code generation disallowed by embedder"), e com hash-wasm toda senha era recusada.
// ponytail: argon2id em JS custa ~0,4 s de CPU por login; exige o plano pago do Workers
// (limite de 30 s). Trocar por um .wasm importado estaticamente se o custo pesar.
const ARGON2ID_OPTIONS = { t: 2, m: 19 * 1024, p: 1, dkLen: 32 };
const ARGON2ID_HASH_PATTERN = /^\$argon2id\$v=19\$([^$]+)\$([^$]+)\$([^$]+)$/u;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/u;

export function isLegacyBcryptHash(hash: string): boolean {
  return BCRYPT_HASH_PATTERN.test(hash);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/u, "");
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifyArgon2id(password: string, hash: string): Promise<boolean> {
  const match = ARGON2ID_HASH_PATTERN.exec(hash);
  if (!match) return false;
  // O argon2 do Node grava os parametros como m,p,t; a ordem nao importa.
  const params = Object.fromEntries(match[1].split(",").map((pair) => pair.split("=")));
  const expected = fromBase64(match[3]);
  const actual = await argon2idAsync(password, fromBase64(match[2]), {
    m: Number(params.m),
    t: Number(params.t),
    p: Number(params.p),
    dkLen: expected.length,
  });
  return sameBytes(actual, expected);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await argon2idAsync(password, salt, ARGON2ID_OPTIONS);
  const { m, t, p } = ARGON2ID_OPTIONS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith("$argon2id$")) return await verifyArgon2id(password, hash);
    if (isLegacyBcryptHash(hash)) return await bcrypt.compare(password, hash);
  } catch (error) {
    // Hash invalido nunca autentica, mas uma falha do runtime nao pode sumir como "senha errada".
    console.error("Falha ao verificar hash de senha", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
  return false;
}
