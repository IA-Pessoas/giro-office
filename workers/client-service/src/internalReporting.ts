import { reportingQueryFields } from "@workspace/shared";
import {
  INTERNAL_SERVICE_TOKEN_HEADER,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import {
  type InternalReportingGrant,
  internalReportingGrantSchema,
} from "../../../services/client-service/src/schemas/internalReporting.schemas.js";
import type { ClientWorkerEnv } from "./env.js";

const REPORTS_GRANT_HEADER = "x-reports-grant";
const REPORTS_GRANT_SIGNATURE_HEADER = "x-reports-grant-signature";

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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  );
}

function constantTimeEqual(left: string | null, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function decodeGrant(value: string | null): InternalReportingGrant {
  if (!value) throw new ServiceError(403, "Grant de relatórios inválido.");
  try {
    const grant = internalReportingGrantSchema.parse(
      JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))),
    );
    if (bytesToBase64Url(new TextEncoder().encode(canonicalJson(grant))) !== value) {
      throw new Error("grant canonical mismatch");
    }
    return grant;
  } catch {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
}

export async function verifyReportingGrant(input: {
  env: ClientWorkerEnv;
  request: Request;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): Promise<InternalReportingGrant> {
  const token = input.env.REPORTS_INTERNAL_TOKEN;
  const secret = input.env.REPORTS_GRANT_SECRET;
  if (!token || !secret) throw new ServiceError(503, "Reporting interno não configurado.");
  if (input.request.headers.get(INTERNAL_SERVICE_TOKEN_HEADER) !== token) {
    throw new ServiceError(403, "Acesso negado.");
  }

  const grantValue = input.request.headers.get(REPORTS_GRANT_HEADER);
  const signature = input.request.headers.get(REPORTS_GRANT_SIGNATURE_HEADER);
  const grant = decodeGrant(grantValue);
  const expectedSignature = await hmacSha256Hex(secret, grantValue ?? "");
  const requestId = input.request.headers.get(REQUEST_ID_HEADER) ?? "";
  const fields = reportingQueryFields(input.fields, undefined);
  const fieldsMatch =
    grant.fields.length === fields.length &&
    grant.fields.every((field, index) => field === fields[index]);
  const now = Math.floor(Date.now() / 1000);

  if (
    !constantTimeEqual(signature, expectedSignature) ||
    grant.operation !== input.operation ||
    grant.source !== input.source ||
    !fieldsMatch ||
    grant.request_id !== requestId ||
    grant.body_sha256 !== (await sha256Hex(canonicalJson(input.body))) ||
    grant.issued_at > now ||
    grant.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return grant;
}
