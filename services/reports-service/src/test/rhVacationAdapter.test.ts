import { createHash, createHmac } from "node:crypto";
import { MAX_REPORTING_QUERY_LIMIT } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { RhVacationAdapter } from "../integrations/rhVacationAdapter.js";

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

describe("RhVacationAdapter", () => {
  it("publica a fonte e assina a consulta com organização e campos selecionados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          rows: [
            {
              employee_name: "Ana Souza",
              acquisition_start: "2024-01-01",
              uses: "01/02/2025 a 15/02/2025 — Férias anuais",
              legacy_period_id: "não publicar",
            },
          ],
          reachedLimit: false,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhVacationAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["rh.vacationHistory"],
          columns: [
            { source: "rh.vacationHistory", field: "employee_name", alias: "employee_name" },
            {
              source: "rh.vacationHistory",
              field: "acquisition_start",
              alias: "acquisition_start",
            },
            { source: "rh.vacationHistory", field: "uses", alias: "uses" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "10000000-0000-0000-0000-000000000001",
        limit: 100,
        request_id: "vacation-report-1",
      }),
    ).resolves.toEqual({
      rows: [
        {
          employee_name: "Ana Souza",
          acquisition_start: "2024-01-01",
          uses: "01/02/2025 a 15/02/2025 — Férias anuais",
        },
      ],
      reachedLimit: false,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = {
      source: "rh.vacationHistory",
      fields: ["employee_name", "acquisition_start", "uses"],
      limit: 100,
    };
    const headers = request.headers as Record<string, string>;
    const grant = headers["x-reports-grant"];
    expect(headers["x-reports-grant-signature"]).toBe(
      createHmac("sha256", "grant-secret").update(grant).digest("hex"),
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      audience: "rh-service",
      organization_id: "10000000-0000-0000-0000-000000000001",
      source: "rh.vacationHistory",
    });
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8")).body_sha256).toBe(
      createHash("sha256").update(canonicalJson(body)).digest("hex"),
    );
    expect(body.limit).toBeLessThanOrEqual(MAX_REPORTING_QUERY_LIMIT);
  });
});
