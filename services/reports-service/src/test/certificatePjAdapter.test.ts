import { createHash, createHmac } from "node:crypto";

import { certificatePjReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { CertificatePjAdapter } from "../integrations/certificatePjAdapter.js";

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

const definition = {
  sources: ["certificado.pj"],
  columns: [
    { source: "certificado.pj", field: "name", alias: "name" },
    { source: "certificado.pj", field: "payment_amount", alias: "payment_amount" },
  ],
  joins: [],
  filters: [],
  filter_groups: [],
  parameters: [],
  aggregations: [],
  order_by: [],
};

describe("CertificatePjAdapter", () => {
  it("publica somente os campos seguros e assina extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              name: "Empresa segura",
              payment_amount: 250,
              id: "nao-publicar",
              password: "nao-publicar",
            },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CertificatePjAdapter({
      certificateServiceUrl: "http://certificate.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "name",
      "model",
      "legal_nature",
      "expiration_date",
      "has_certificate",
      "was_paid",
      "payment_date",
      "payment_amount",
    ]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(["id", "cnpj", "password", "organization_id"]),
    );
    expect(certificatePjReportingCatalog.relations).toEqual([]);

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-837",
      }),
    ).resolves.toEqual([{ name: "Empresa segura", payment_amount: 250 }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "certificado.pj",
      fields: ["name", "payment_amount"],
      limit: 10,
    };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://certificate.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-837",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "certificate-service",
      organization_id: "00000000-0000-4000-8000-000000000001",
      source: "certificado.pj",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new CertificatePjAdapter({
      certificateServiceUrl: "http://certificate.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-837",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
