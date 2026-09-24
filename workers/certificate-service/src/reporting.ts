import {
  type InternalReportingGrant,
  internalReportingGrantSchema,
} from "@workspace/certificate-service/src/schemas/internalReporting.schemas.js";
import {
  certificatePfReportingCatalog,
  certificatePjReportingCatalog,
  executeReportingQuery,
  getCertificatePfReportingFields,
  getCertificatePjReportingFields,
  type ReportingQuery,
  reportingQueryFields,
  ServiceError,
  withReportingSnapshot,
} from "@workspace/shared";
import type { CertificateWorkerEnv } from "./env.js";

type ReportingDelegate = {
  findMany(input: {
    where: { organization_id: string };
    select: Record<string, true>;
    take: number;
    skip?: number;
    orderBy?: { id: "asc" };
  }): Promise<readonly Record<string, unknown>[]>;
};

export interface CertificateReportingPrisma {
  certificatePF: ReportingDelegate;
  certificatePJ: ReportingDelegate;
  reportGrantUse: {
    deleteMany(input: { where: { expires_at: { lte: Date } } }): Promise<unknown>;
    create(input: { data: { grant_hash: string; expires_at: Date } }): Promise<unknown>;
  };
  $transaction<T>(
    callback: (transaction: CertificateReportingPrisma) => Promise<T>,
    options?: Record<string, unknown>,
  ): Promise<T>;
}

type CertificateReportingSource = "certificado.pf" | "certificado.pj";

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

function constantTimeEqual(left: string | undefined, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
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

function decodeGrant(value: string | undefined): InternalReportingGrant {
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

function reportingSecrets(
  env: CertificateWorkerEnv,
  operation: "catalog" | "extract",
  source: string,
): { token: string | undefined; secret: string | undefined } {
  if (operation === "extract" && source === "certificado.pf") {
    return {
      token: env.CERTIFICATE_REPORTING_TOKEN,
      secret: env.CERTIFICATE_REPORTING_GRANT_SECRET,
    };
  }
  return { token: env.REPORTS_INTERNAL_TOKEN, secret: env.REPORTS_GRANT_SECRET };
}

export async function verifyCertificateReportingGrant(input: {
  env: CertificateWorkerEnv;
  request: Request;
  operation: "catalog" | "extract";
  source: string;
  fields: readonly string[];
  body: unknown;
}): Promise<{ value: string; grant: InternalReportingGrant }> {
  const { token, secret } = reportingSecrets(input.env, input.operation, input.source);
  if (!token || !secret) throw new ServiceError(503, "Reporting interno não configurado.");
  if (
    !constantTimeEqual(input.request.headers.get("x-internal-service-token") ?? undefined, token)
  ) {
    throw new ServiceError(403, "Acesso negado.");
  }

  const value = input.request.headers.get("x-reports-grant") ?? undefined;
  const grant = decodeGrant(value);
  const fields = reportingQueryFields(
    input.fields,
    (input.body as { query?: ReportingQuery }).query,
  );
  const now = Math.floor(Date.now() / 1000);
  const fieldsMatch =
    grant.fields.length === fields.length &&
    grant.fields.every((field, index) => field === fields[index]);
  if (
    !constantTimeEqual(
      input.request.headers.get("x-reports-grant-signature") ?? undefined,
      await hmacSha256Hex(secret, value ?? ""),
    ) ||
    grant.operation !== input.operation ||
    grant.source !== input.source ||
    !fieldsMatch ||
    grant.request_id !== (input.request.headers.get("x-request-id") ?? "") ||
    grant.body_sha256 !== (await sha256Hex(canonicalJson(input.body))) ||
    grant.issued_at > now ||
    grant.expires_at <= now
  ) {
    throw new ServiceError(403, "Grant de relatórios inválido.");
  }
  return { value: value as string, grant };
}

export class CertificateReportingService {
  constructor(
    private readonly prisma: CertificateReportingPrisma,
    private readonly inSnapshot = false,
  ) {}

  async consumeGrant(grant: string, expiresAt: number): Promise<void> {
    await this.prisma.reportGrantUse.deleteMany({ where: { expires_at: { lte: new Date() } } });
    try {
      await this.prisma.reportGrantUse.create({
        data: { grant_hash: await sha256Hex(grant), expires_at: new Date(expiresAt * 1000) },
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ServiceError(403, "Grant de relatórios já utilizado.");
      }
      throw error;
    }
  }

  async extract(input: {
    query?: ReportingQuery;
    offset?: number;
    organizationId: string;
    source: CertificateReportingSource;
    fields: readonly string[];
    limit: number;
  }): Promise<{ rows: readonly Record<string, unknown>[]; reachedLimit: boolean }> {
    if (input.query && !this.inSnapshot) {
      return withReportingSnapshot(this.prisma, (transaction) =>
        new CertificateReportingService(transaction, true).extract(input),
      );
    }
    if (input.query) {
      return executeReportingQuery({ ...input, query: input.query }, (fields, limit, offset) =>
        this.extract({ ...input, query: undefined, fields, limit, offset }),
      );
    }

    const allowedFields =
      input.source === "certificado.pf"
        ? getCertificatePfReportingFields(input.source)
        : getCertificatePjReportingFields(input.source);
    if (input.fields.some((field) => !allowedFields.includes(field))) {
      throw new ServiceError(403, "Campo não publicado para relatórios.");
    }

    const delegate =
      input.source === "certificado.pf" ? this.prisma.certificatePF : this.prisma.certificatePJ;
    const rows = await delegate.findMany({
      where: { organization_id: input.organizationId },
      select: Object.fromEntries(input.fields.map((field) => [field, true])),
      ...(input.offset !== undefined
        ? { skip: input.offset, orderBy: { id: "asc" as const } }
        : {}),
      take: input.limit + 1,
    });
    return {
      rows: rows
        .slice(0, input.limit)
        .map((row) =>
          Object.fromEntries(
            input.fields
              .filter((field) => Object.getOwnPropertyDescriptor(row, field) !== undefined)
              .map((field) => [field, row[field]]),
          ),
        ),
      reachedLimit: rows.length > input.limit,
    };
  }
}

export { certificatePfReportingCatalog, certificatePjReportingCatalog };
