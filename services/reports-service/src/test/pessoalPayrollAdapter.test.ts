import { createHash, createHmac } from "node:crypto";

import { pessoalPayrollReportingCatalog } from "@workspace/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PessoalPayrollAdapter } from "../integrations/pessoalPayrollAdapter.js";

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
  sources: ["pessoal.payroll"],
  columns: [
    { source: "pessoal.payroll", field: "advance", alias: "advance" },
    { source: "pessoal.payroll", field: "employees", alias: "employees" },
  ],
  joins: [],
  filters: [],
  filter_groups: [],
  parameters: [],
  aggregations: [],
  order_by: [],
};

describe("PessoalPayrollAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publica campos seguros, limita a origem e assina o extract por organização", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [{ advance: true, employees: 12, id: "hidden-id" }],
          reachedLimit: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalPayrollAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual([
      "client_name",
      "responsible_name",
      "union_name",
      "group_name",
      "group_state",
      "advance",
      "advance_type",
      "advance_amount",
      "onvio",
      "vt",
      "vt_value",
      "vt_type",
      "va",
      "assistance_fee",
      "bem_mais",
      "bsf",
      "reinf",
      "employees",
    ]);
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toContain("id");
    expect(
      adapter.sources[0]?.fields.find((field) => field.key === "group_state")?.filter_operators,
    ).toEqual(["eq", "in"]);
    expect(pessoalPayrollReportingCatalog.sources[0]?.keys.map((field) => field.key)).toEqual([
      "client_id",
      "responsible_id",
      "union_id",
    ]);

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 50_001,
        request_id: "request-843",
      }),
    ).resolves.toEqual({
      rows: [{ advance: true, employees: 12 }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "pessoal.payroll", fields: ["advance", "employees"], limit: 101 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://pessoal.test/internal/reporting/extract",
    );
    expect(request.headers).toEqual(
      expect.objectContaining({
        "x-internal-service-token": "internal-token",
        "x-request-id": "request-843",
      }),
    );
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    const payload = JSON.parse(Buffer.from(grant, "base64url").toString("utf8"));
    expect(payload).toMatchObject({
      audience: "pessoal-service",
      operation: "extract",
      organization_id: "00000000-0000-4000-8000-000000000002",
      source: "pessoal.payroll",
    });
    expect((request.headers as Record<string, string>)["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(payload.body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
  });

  it("rejeita definições fora do recorte e respostas upstream inválidas sem expor dados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ secret: "sensitive" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PessoalPayrollAdapter({
      pessoalServiceUrl: "http://pessoal.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          ...definition,
          filters: [
            { source: "pessoal.payroll", field: "advance", operator: "eq", parameter: "value" },
          ],
        },
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-843",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      adapter.preview({
        definition,
        organization_id: "00000000-0000-4000-8000-000000000002",
        limit: 10,
        request_id: "request-843",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(JSON.stringify(fetchMock.mock.results)).not.toContain("sensitive");
  });
});
