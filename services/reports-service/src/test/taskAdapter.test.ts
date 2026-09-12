import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { TaskAdapter } from "../integrations/taskAdapter.js";

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

describe("TaskAdapter", () => {
  it("publica campos seguros e assina extract interno", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ name: "Tarefa segura", department: "Fiscal" }], reachedLimit: true },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TaskAdapter({
      taskServiceUrl: "http://task.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    expect(adapter.sources[0]?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["name", "department", "pending_approval", "charge_comercial"]),
    );
    expect(adapter.sources[0]?.fields.map((field) => field.key)).not.toEqual(
      expect.arrayContaining(["project_id", "client_id", "responsible_id"]),
    );

    await expect(
      adapter.preview({
        definition: {
          sources: ["integracao.tasks"],
          columns: [
            { source: "integracao.tasks", field: "name", alias: "name" },
            { source: "integracao.tasks", field: "department", alias: "department" },
          ],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-833",
      }),
    ).resolves.toEqual({
      rows: [{ name: "Tarefa segura", department: "Fiscal" }],
      reachedLimit: true,
    });

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = { source: "integracao.tasks", fields: ["name", "department"], limit: 10 };
    expect(new URL(fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "http://task.test/internal/reporting/extract",
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
    const adapter = new TaskAdapter({
      taskServiceUrl: "http://task.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });

    await expect(
      adapter.preview({
        definition: {
          sources: ["integracao.tasks"],
          columns: [{ source: "integracao.tasks", field: "name", alias: "name" }],
          joins: [],
          filters: [],
          filter_groups: [],
          parameters: [],
          aggregations: [],
          order_by: [],
        },
        organization_id: "00000000-0000-4000-8000-000000000001",
        limit: 10,
        request_id: "request-833",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
