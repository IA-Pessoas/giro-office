import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { ServiceError } from "@workspace/shared";

// Verificação mínima de PKCS#12 (RFC 7292): estrutura PFX em DER/BER e, quando a senha é conhecida,
// o MAC de integridade. Não descriptografa a chave privada.

export type Pkcs12Check = "valid" | "invalid" | "wrong_password";

interface Tlv {
  tag: number;
  value: Buffer;
  end: number;
}

const TAG_INTEGER = 0x02;
const TAG_OCTET_STRING = 0x04;
const TAG_CONSTRUCTED_OCTET_STRING = 0x24;
const TAG_OID = 0x06;
const TAG_SEQUENCE = 0x30;
const TAG_EXPLICIT_0 = 0xa0;

const OID_PKCS7_DATA = "2a864886f70d010701";
const MAC_ALGORITHMS: Record<string, { hash: string; blockSize: number }> = {
  "2b0e03021a": { hash: "sha1", blockSize: 64 },
  "608648016503040204": { hash: "sha224", blockSize: 64 },
  "608648016503040201": { hash: "sha256", blockSize: 64 },
  "608648016503040202": { hash: "sha384", blockSize: 128 },
  "608648016503040203": { hash: "sha512", blockSize: 128 },
};
const MAX_MAC_ITERATIONS = 1_000_000;

class Pkcs12FormatError extends Error {}

function readTlv(buffer: Buffer, offset: number): Tlv {
  if (offset + 2 > buffer.length) throw new Pkcs12FormatError();
  const tag = buffer[offset] as number;
  let position = offset + 1;
  let length = buffer[position++] as number;

  if (length === 0x80) {
    // Comprimento indefinido (BER): filhos até o marcador 00 00.
    let child = position;
    while (buffer[child] !== 0 || buffer[child + 1] !== 0) {
      child = readTlv(buffer, child).end;
    }
    return { tag, value: buffer.subarray(position, child), end: child + 2 };
  }

  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    if (lengthBytes < 1 || lengthBytes > 4 || position + lengthBytes > buffer.length) {
      throw new Pkcs12FormatError();
    }
    length = 0;
    for (let index = 0; index < lengthBytes; index++) {
      length = length * 256 + (buffer[position++] as number);
    }
  }

  const end = position + length;
  if (end > buffer.length) throw new Pkcs12FormatError();
  return { tag, value: buffer.subarray(position, end), end };
}

function children(value: Buffer): Tlv[] {
  const items: Tlv[] = [];
  for (let offset = 0; offset < value.length; ) {
    const item = readTlv(value, offset);
    items.push(item);
    offset = item.end;
  }
  return items;
}

function expectTag(tlv: Tlv | undefined, tag: number): Tlv {
  if (!tlv || tlv.tag !== tag) throw new Pkcs12FormatError();
  return tlv;
}

function octetStringContent(tlv: Tlv | undefined): Buffer {
  if (tlv?.tag === TAG_OCTET_STRING) return tlv.value;
  if (tlv?.tag === TAG_CONSTRUCTED_OCTET_STRING) {
    return Buffer.concat(children(tlv.value).map(octetStringContent));
  }
  throw new Pkcs12FormatError();
}

function readInteger(tlv: Tlv): number {
  if (tlv.value.length === 0 || tlv.value.length > 4) throw new Pkcs12FormatError();
  return tlv.value.reduce((total, byte) => total * 256 + byte, 0);
}

function bmpPassword(password: string): Buffer {
  // BMPString big-endian com terminador nulo, como no PKCS#12.
  return Buffer.from(`${password}\0`, "utf16le").swap16();
}

function repeatToBlocks(bytes: Buffer, blockSize: number): Buffer {
  if (bytes.length === 0) return bytes;
  const output = Buffer.alloc(blockSize * Math.ceil(bytes.length / blockSize));
  for (let index = 0; index < output.length; index++) {
    output[index] = bytes[index % bytes.length] as number;
  }
  return output;
}

// RFC 7292, apêndice B.2, com ID = 3 (chave do MAC) e chave do tamanho do hash.
function deriveMacKey(
  hash: string,
  blockSize: number,
  password: Buffer,
  salt: Buffer,
  iterations: number,
): Buffer {
  const diversifier = Buffer.alloc(blockSize, 3);
  const input = Buffer.concat([
    repeatToBlocks(salt, blockSize),
    repeatToBlocks(password, blockSize),
  ]);
  let digest = createHash(hash).update(diversifier).update(input).digest();
  for (let round = 1; round < iterations; round++) {
    digest = createHash(hash).update(digest).digest();
  }
  return digest;
}

export function checkPkcs12(buffer: Buffer, password: string | undefined): Pkcs12Check {
  try {
    const pfx = expectTag(readTlv(buffer, 0), TAG_SEQUENCE);
    if (pfx.end !== buffer.length) return "invalid";

    const [version, authSafe, macData] = children(pfx.value);
    if (readInteger(expectTag(version, TAG_INTEGER)) !== 3) return "invalid";

    const [contentType, content] = children(expectTag(authSafe, TAG_SEQUENCE).value);
    if (expectTag(contentType, TAG_OID).value.toString("hex") !== OID_PKCS7_DATA) return "invalid";
    const authSafeBytes = octetStringContent(children(expectTag(content, TAG_EXPLICIT_0).value)[0]);
    expectTag(readTlv(authSafeBytes, 0), TAG_SEQUENCE);

    if (!macData || password === undefined) return "valid";

    const [digestInfo, saltTlv, iterationsTlv] = children(expectTag(macData, TAG_SEQUENCE).value);
    const [algorithm, digestTlv] = children(expectTag(digestInfo, TAG_SEQUENCE).value);
    const [algorithmOid] = children(expectTag(algorithm, TAG_SEQUENCE).value);
    const mac = MAC_ALGORITHMS[expectTag(algorithmOid, TAG_OID).value.toString("hex")];
    // ponytail: MAC fora da lista (ex.: PBMAC1) só passa pela checagem estrutural.
    if (!mac) return "valid";

    const expected = octetStringContent(digestTlv);
    const salt = octetStringContent(saltTlv);
    const iterations = iterationsTlv ? readInteger(expectTag(iterationsTlv, TAG_INTEGER)) : 1;
    if (iterations < 1 || iterations > MAX_MAC_ITERATIONS) return "invalid";

    const key = deriveMacKey(mac.hash, mac.blockSize, bmpPassword(password), salt, iterations);
    const actual = createHmac(mac.hash, key).update(authSafeBytes).digest();
    return actual.length === expected.length && timingSafeEqual(actual, expected)
      ? "valid"
      : "wrong_password";
  } catch (err: unknown) {
    if (err instanceof Pkcs12FormatError || err instanceof RangeError) return "invalid";
    throw err;
  }
}

/** Rejeita com 400 o arquivo que não é PKCS#12 ou que a senha cadastrada não abre. */
export function assertValidPkcs12(buffer: Buffer, password: string | undefined): void {
  const result = checkPkcs12(buffer, password);
  if (result === "invalid") {
    throw new ServiceError(
      400,
      "O arquivo enviado não é um certificado digital PKCS#12 (.pfx/.p12) válido.",
    );
  }
  if (result === "wrong_password") {
    throw new ServiceError(
      400,
      "A senha cadastrada não abre este certificado. Atualize a senha do certificado e envie o arquivo de novo.",
    );
  }
}
