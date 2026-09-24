const INVALID_TOKEN = "Invalid token";

const invalidToken = (): never => {
  throw new Error(INVALID_TOKEN);
};

const decodeBase64Url = (value: string): Uint8Array => {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) invalidToken();

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const decodeJson = (value: string): unknown => {
  const bytes = decodeBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function verifyHs256Jwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown>> {
  try {
    if (typeof token !== "string" || typeof secret !== "string") invalidToken();

    const segments = token.split(".");
    if (segments.length !== 3) invalidToken();

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);
    const signature = decodeBase64Url(encodedSignature);

    if (!isRecord(header) || header.alg !== "HS256") invalidToken();
    if (!isRecord(payload)) invalidToken();

    const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify("HMAC", key, signature, signingInput);
    if (!validSignature) invalidToken();

    const verifiedPayload = isRecord(payload) ? payload : invalidToken();
    const now = Math.floor(Date.now() / 1000);
    if (
      ("exp" in verifiedPayload &&
        (typeof verifiedPayload.exp !== "number" ||
          !Number.isFinite(verifiedPayload.exp) ||
          now >= verifiedPayload.exp)) ||
      ("nbf" in verifiedPayload &&
        (typeof verifiedPayload.nbf !== "number" ||
          !Number.isFinite(verifiedPayload.nbf) ||
          now < verifiedPayload.nbf))
    ) {
      invalidToken();
    }

    return verifiedPayload;
  } catch {
    throw new Error(INVALID_TOKEN);
  }
}
