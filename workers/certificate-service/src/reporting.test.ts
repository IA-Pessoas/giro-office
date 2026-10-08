import { describe, expect, it, vi } from "vitest";
import { createCertificateWorkerApp } from "./app.js";
import type { CertificateWorkerEnv } from "./env.js";
import { CertificateReportingService } from "./reporting.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "reports-internal-token";
const GRANT_SECRET = "reports-grant-secret";

function env(): CertificateWorkerEnv {
  return {
    JWT_SECRET: "certificate-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: "certificate-gateway-internal-token",
    CERTIFICATE_PASSWORD_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    REPORTS_INTERNAL_TOKEN: INTERNAL_TOKEN,
    REPORTS_GRANT_SECRET: GRANT_SECRET,
  };
}

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

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(GRANT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  ).toString("hex");
}

async function grant(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: string[];
  body: unknown;
}): Promise<Record<string, string>> {
  const requestId = "report-request";
  const now = Math.floor(Date.now() / 1000);
  const value = base64Url(
    canonicalJson({
      version: 1,
      audience: "certificate-service",
      operation: input.operation,
      source: input.source,
      organization_id: ORGANIZATION_ID,
      fields: input.fields,
      request_id: requestId,
      issued_at: now - 1,
      expires_at: now + 30,
      body_sha256: await sha256(canonicalJson(input.body)),
    }),
  );
  return {
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-request-id": requestId,
    "x-reports-grant": value,
    "x-reports-grant-signature": await hmac(value),
  };
}

describe("certificate Worker reporting interno", () => {
  it("mantém catálogo, grant e extração no tenant do grant", async () => {
    const reportingService = {
      consumeGrant: vi.fn(async () => undefined),
      extract: vi.fn(async () => ({ rows: [{ name: "Empresa" }], reachedLimit: false })),
    };
    const app = createCertificateWorkerApp({ env: env(), reportingService });

    const catalog = await app.request("https://certificate.test/internal/reporting/catalog", {
      headers: await grant({
        operation: "catalog",
        source: "certificado.catalog",
        fields: [],
        body: {},
      }),
    });
    expect(catalog.status).toBe(200);
    expect((await catalog.json()).data.sources).toHaveLength(2);

    const body = { source: "certificado.pj", fields: ["name"], limit: 10 };
    const extract = await app.request("https://certificate.test/internal/reporting/extract", {
      method: "POST",
      headers: {
        ...(await grant({ operation: "extract", ...body, body })),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(extract.status).toBe(200);
    expect(reportingService.extract).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      source: "certificado.pj",
      fields: ["name"],
      limit: 10,
    });
  });

  it("nega reporting sem grant válido", async () => {
    const reportingService = {
      consumeGrant: vi.fn(async () => undefined),
      extract: vi.fn(async () => ({ rows: [], reachedLimit: false })),
    };
    const app = createCertificateWorkerApp({ env: env(), reportingService });

    const response = await app.request("https://certificate.test/internal/reporting/catalog", {
      headers: { "x-internal-service-token": INTERNAL_TOKEN },
    });

    expect(response.status).toBe(403);
    expect(reportingService.consumeGrant).not.toHaveBeenCalled();
  });

  it("extrai somente o tenant informado e preserva o limite da página", async () => {
    const findMany = vi.fn(async () => [
      { id: "1", name: "Primeiro" },
      { id: "2", name: "Segundo" },
    ]);
    const service = new CertificateReportingService({
      certificatePF: { findMany: vi.fn() },
      certificatePJ: { findMany },
      reportGrantUse: { deleteMany: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
    });

    await expect(
      service.extract({
        organizationId: ORGANIZATION_ID,
        source: "certificado.pj",
        fields: ["name"],
        limit: 1,
      }),
    ).resolves.toEqual({ rows: [{ name: "Primeiro" }], reachedLimit: true });
    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: ORGANIZATION_ID },
      select: { name: true },
      take: 2,
    });
  });
});
