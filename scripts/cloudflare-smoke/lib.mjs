// Helpers puros do smoke real dos Workers Cloudflare.
// Sem segredo embutido e sem URL fixa: tudo vem de env (ver runbook).
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

export const TEST_PREFIX = "cfsmoke";

/** Marcadores de ambiente que o harness nunca aceita como alvo. */
const PRODUCTION_MARKERS = [/prod/i, /producao/i, /produção/i, /\bprd\b/i, /\blive\b/i];

export function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** JSON canônico usado pelo grant de reporting (mesma ordem dos Workers). */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function signJwt(payload, secret) {
  const signingInput = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

/** Par CSRF no formato do runtime: token base64url de 32 bytes e hash SHA-256 hex. */
export function csrfPair() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

/**
 * Monta o grant HMAC do reporting interno exatamente como o reports-service emite.
 * O grant precisa ser o base64url do JSON canônico, senão o Worker rejeita com 403.
 */
export function signReportingGrant({
  audience,
  operation,
  source,
  organizationId,
  fields,
  requestId,
  body,
  secret,
  ttlSeconds = 30,
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1,
    audience,
    operation,
    source,
    organization_id: organizationId,
    fields: [...fields],
    request_id: requestId,
    issued_at: issuedAt,
    expires_at: issuedAt + ttlSeconds,
    body_sha256: sha256Hex(canonicalJson(body)),
  };
  const grant = b64url(canonicalJson(payload));
  return { grant, signature: createHmac("sha256", secret).update(grant).digest("hex") };
}

export function looksProduction(value) {
  return PRODUCTION_MARKERS.some((pattern) => pattern.test(String(value ?? "")));
}

export function parsePostgresTarget(dsn) {
  const url = new URL(dsn);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//u, ""),
    user: decodeURIComponent(url.username || ""),
  };
}

const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

export function isLoopback(host) {
  return LOOPBACK_HOSTS.has(String(host));
}

/**
 * Recusa alvos que parecem produção e exige confirmação explícita fora do banco local.
 * Retorna a frase esperada quando a confirmação falta, para o operador poder repetir.
 */
export function assertTargetAllowed({
  mode,
  databaseUrl,
  baseUrls = [],
  confirmWrites,
  allowExternal,
}) {
  const target = parsePostgresTarget(databaseUrl);
  const suspects = [target.host, target.database, target.user, ...baseUrls];
  const flagged = suspects.filter((value) => looksProduction(value));
  if (flagged.length > 0) {
    throw new Error(
      `Alvo recusado: parece produção (${flagged.join(", ")}). O harness não roda contra produção.`,
    );
  }

  if (mode === "local") {
    if (!isLoopback(target.host)) {
      throw new Error(
        `Modo local exige banco em loopback; recebido host "${target.host}". Use SMOKE_MODE=external com confirmação para outro alvo.`,
      );
    }
    for (const baseUrl of baseUrls) {
      const host = new URL(baseUrl).hostname;
      if (!isLoopback(host)) {
        throw new Error(`Modo local exige Workers em loopback; recebido "${baseUrl}".`);
      }
    }
    return { confirmationPhrase: null };
  }

  if (allowExternal !== "1") {
    throw new Error("Modo external exige SMOKE_ALLOW_EXTERNAL=1 fornecido pelo operador.");
  }
  const phrase = `CONFIRMO-ESCRITA:${target.host}/${target.database}`;
  if (confirmWrites !== phrase) {
    throw new Error(`Modo external exige SMOKE_CONFIRM_WRITES="${phrase}".`);
  }
  return { confirmationPhrase: phrase };
}

/** Identificador curto do run; entra no nome de toda linha criada para permitir limpeza. */
export function newRunId() {
  return `${TEST_PREFIX}-${randomUUID().slice(0, 8)}`;
}

export function testLabel(runId, suffix) {
  return `${runId}-${suffix}`;
}
