import {
  type InternalReportingGrant,
  internalReportingExtractBodySchema,
  internalReportingGrantSchema,
} from "@workspace/parcelamento-service/src/schemas/internalReporting.schemas.js";
import {
  parcelamentoReportingCatalog,
  reportingQueryFields,
  ServiceError,
} from "@workspace/shared";
import type { ParcelamentoWorkerEnv } from "./env.js";

export { parcelamentoReportingCatalog, internalReportingExtractBodySchema, reportingQueryFields };
export type { InternalReportingGrant };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padded = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function equalText(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const actual = new TextEncoder().encode(left);
  const expected = new TextEncoder().encode(right);
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0;
}

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function verifyReportingGrant(input: {
  env: ParcelamentoWorkerEnv;
  token: string | undefined;
  grant: string | undefined;
  signature: string | undefined;
  requestId: string;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): Promise<InternalReportingGrant> {
  if (!equalText(input.token, input.env.REPORTS_INTERNAL_TOKEN ?? "")) {
    throw new ServiceError(403, "Acesso negado.");
  }
  if (!input.grant || !input.env.REPORTS_GRANT_SECRET) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  let grant: InternalReportingGrant;
  try {
    grant = internalReportingGrantSchema.parse(JSON.parse(decodeBase64Url(input.grant)));
    if (!equalText(base64Url(new TextEncoder().encode(canonicalJson(grant))), input.grant)) {
      throw new Error("grant não canônico");
    }
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  if (!equalText(input.signature, await hmacHex(input.grant, input.env.REPORTS_GRANT_SECRET))) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    grant.fields.length === input.fields.length &&
    grant.fields.every((field, index) => field === input.fields[index]);
  if (
    grant.operation !== input.operation ||
    grant.source !== input.source ||
    !fieldsMatch ||
    grant.request_id !== input.requestId ||
    grant.body_sha256 !== (await digestHex(canonicalJson(input.body))) ||
    grant.issued_at > now ||
    grant.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return grant;
}

export function reportingBodyHash(body: unknown): Promise<string> {
  return digestHex(canonicalJson(body));
}
