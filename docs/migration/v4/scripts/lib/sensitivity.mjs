import crypto from "node:crypto";

const CREDENTIAL_COLUMN_PATTERN = /senha|password|passwd|reset[_-]?token/i;
const SECRET_COLUMN_PATTERN = /token|secret|chave|private[_-]?key|certificado|pfx|pem/i;
const SAFE_LEGACY_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const JWT_CANDIDATE_PATTERN = /([a-z0-9_-]+)\.([a-z0-9_-]+)\.([a-z0-9_-]+)/gi;
const PEM_OR_PFX_PATTERN = /-----BEGIN [A-Z0-9 #_-]+-----/i;
const ENCODED_KEY_MATERIAL_PATTERN =
  /\bMII[a-z0-9+/]{80,}={0,2}\b|data:application\/(?:x-pkcs12|pkcs12|x-pem-file|octet-stream);base64,/i;
const JSON_SECRET_VALUE_PATTERN =
  /\\?["'](?:senha|password|passwd|reset[_-]?token|token|secret|chave|private[_-]?key)\\?["']\s*:\s*(?!null\b|\s*\\?["']\s*\\?["'])/i;
const RAW_SQL_PATTERN =
  /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_`"]|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\b|COPY\s+[A-Za-z_`"])/i;

export function isSensitiveColumn(name) {
  return classifySensitivity(name) !== "none";
}

export function classifySensitivity(name) {
  if (typeof name !== "string") {
    return "none";
  }

  if (CREDENTIAL_COLUMN_PATTERN.test(name)) {
    return "credential";
  }
  if (SECRET_COLUMN_PATTERN.test(name)) {
    return "secret";
  }
  return "none";
}

export function toLegacyIdRef(value) {
  const text = String(value);
  if ((UUID_PATTERN.test(text) || SAFE_LEGACY_ID_PATTERN.test(text)) && !CPF_PATTERN.test(text)) {
    return text;
  }

  return `sha256:${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function sanitizeQuarantineItem(item) {
  const sanitized = {
    sourceTable: item.sourceTable,
    legacyIdRef: toLegacyIdRef(item.legacyIdRef ?? item.legacyId),
    ...(item.stepId === undefined ? {} : { stepId: item.stepId }),
    field: item.field ?? null,
    reasonCode: item.reasonCode,
    destinationTable: item.destinationTable ?? null,
    decisionStatus: "unresolved",
  };

  assertNoSensitiveValues(sanitized);
  return sanitized;
}

export function assertNoSensitiveValues(value) {
  inspectValue(value, new WeakSet());
}

export function assertNoSensitiveSerializedContent(content) {
  if (typeof content !== "string") {
    throw new TypeError("Conteúdo serializado deve ser texto");
  }
  const reasonCode = serializedSensitivityReason(content);
  if (reasonCode !== null) {
    const error = new Error("Valor sensivel identificado no relatorio");
    error.reasonCode = reasonCode;
    throw error;
  }
}

function serializedSensitivityReason(content) {
  if (CREDENTIAL_URL_PATTERN.test(content)) return "CREDENTIAL_URL";
  if (EMAIL_PATTERN.test(content)) return "EMAIL";
  if (CPF_PATTERN.test(content)) return "CPF";
  if (hasPlausibleJwt(content)) return "JWT";
  if (PEM_OR_PFX_PATTERN.test(content)) return "PEM";
  if (ENCODED_KEY_MATERIAL_PATTERN.test(content)) return "ENCODED_KEY_MATERIAL";
  if (JSON_SECRET_VALUE_PATTERN.test(content)) return "JSON_SECRET_VALUE";
  if (RAW_SQL_PATTERN.test(content)) return "RAW_SQL";
  if (
    /\b(?:senha|password|passwd|reset[_-]?token|token|secret|chave|private[_-]?key)\s*=\s*\S+/i.test(
      content,
    )
  ) {
    return "SECRET_ASSIGNMENT";
  }
  return null;
}

function inspectValue(value, seen) {
  if (Buffer.isBuffer(value)) {
    throw new Error("Valor sensivel identificado no relatorio");
  }

  if (typeof value === "string") {
    if (
      CREDENTIAL_URL_PATTERN.test(value) ||
      EMAIL_PATTERN.test(value) ||
      CPF_PATTERN.test(value) ||
      hasPlausibleJwt(value) ||
      PEM_OR_PFX_PATTERN.test(value) ||
      ENCODED_KEY_MATERIAL_PATTERN.test(value) ||
      JSON_SECRET_VALUE_PATTERN.test(value) ||
      RAW_SQL_PATTERN.test(value)
    ) {
      throw new Error("Valor sensivel identificado no relatorio");
    }
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      inspectValue(entry, seen);
    }
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveColumn(key) && hasNonEmptyValue(entry)) {
      throw new Error("Valor sensivel identificado no relatorio");
    }
    inspectValue(entry, seen);
  }
}

function hasPlausibleJwt(value) {
  for (const match of value.matchAll(JWT_CANDIDATE_PATTERN)) {
    try {
      const header = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (
        header !== null &&
        !Array.isArray(header) &&
        typeof header === "object" &&
        "alg" in header
      ) {
        return true;
      }
    } catch {}
  }

  return false;
}

function hasNonEmptyValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}
