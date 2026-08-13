import crypto from "node:crypto";

const UUID_NAMESPACE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidV5(namespace, name) {
  if (typeof namespace !== "string" || !UUID_NAMESPACE_PATTERN.test(namespace)) {
    throw new TypeError("Namespace UUID v5 invalido");
  }

  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const digest = crypto
    .createHash("sha1")
    .update(namespaceBytes)
    .update(Buffer.from(String(name), "utf8"))
    .digest()
    .subarray(0, 16);

  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
