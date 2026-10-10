import { createHash, createHmac } from "node:crypto";

import { pessoalObligationsReportingCatalog } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";

import { PessoalObligationsAdapter } from "../integrations/pessoalObligationsAdapter.js";

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

describe("PessoalObligationsAdapter", () => {
  it("publica somente campos seguros, assina o extract e preserva o limite da origem", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ competence: "2026-08", advance: false, id: "hidden-id" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalObligationsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "competence",
      "client_name",
      "client_code",
      "client_document",
      "client_status",
      "responsible_name",
      "group_snapshot_name",
      "group_snapshot_policy",
      "group_snapshot_state",
      "advance",
      "payroll",
      "charges",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "va",
      "vt",
      "advance_state",
      "payroll_state",
      "charges_state",
      "assistance_fee_state",
      "bem_mais_state",
      "bsf_state",
      "va_state",
      "vt_state",
    ]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(
      adapter.sources[0]?.fields.find((field) => field.key === "competence")?.filter_operators,
    ).toEqual(["eq", "neq", "contains", "in"]);
    expect(pessoalObligationsReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
      "responsavel_id",
    ]);

    await expect(
      adapter.preview({
        definition: {
          sources: ["pessoal.obligations"],
          columns: [
            { source: "pessoal.obligations", field: "competence", alias: "competence" },
            { source: "pessoal.obligations", field: "advance", alias: "advance" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 50_001,
        request_id: "request-844",
      }),
    ).resolves.toEqual({ rows: [{ competence: "2026-08", advance: false }], reachedLimit: true });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "pessoal.obligations",
      fields: ["competence", "advance"],
      limit: 50_001,
    };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://pessoal.test/internal/reporting/extract",
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("converte resposta upstream inválida em erro seguro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) }),
    );
    const adapter = new PessoalObligationsAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["pessoal.obligations"],
          columns: [{ source: "pessoal.obligations", field: "competence", alias: "competence" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-844",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
