import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SourceCatalogService } from "../catalog/sourceCatalogService.js";
import { RhEmployeesAdapter } from "../integrations/rhEmployeesAdapter.js";
import { ReportCsvService } from "../services/reportCsvService.js";
import { ReportExportService } from "../services/reportExportService.js";

const organizationId = "10000000-0000-0000-0000-000000000001";

describe("RhEmployeesAdapter", () => {
  it("restringe dados pessoais ao RH autorizado e não publica campos sensíveis", () => {
    const adapter = new RhEmployeesAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });
    const catalog = new SourceCatalogService([adapter]);

    expect(
      catalog.getAuthorizedCatalog({ organization_id: organizationId, modules: { rh: 2 } }).sources,
    ).toEqual([]);
    const authorized = catalog.getAuthorizedCatalog({
      organization_id: organizationId,
      modules: { rh: 3 },
    });
    expect(authorized.sources.map((source) => source.key)).toEqual([
      "rh.employees",
      "rh.birthdays",
    ]);
    expect(
      authorized.sources.flatMap((source) => source.fields.map((field) => field.key)),
    ).not.toEqual(expect.arrayContaining(["cpf", "rg", "email", "phone", "address"]));
  });

  it("encaminha filtros de mês e departamento e exporta o snapshot filtrado em CSV", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { rows: [{ name: "Colaboradora", birth_day: 30 }], reachedLimit: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new RhEmployeesAdapter({
      rhServiceUrl: "http://rh.test",
      reportsInternalToken: "internal-token",
      reportsGrantSecret: "grant-secret",
      sourceTimeoutMs: 100,
    });
    const result = await adapter.preview({
      definition: {
        sources: ["rh.birthdays"],
        columns: [
          { source: "rh.birthdays", field: "name", alias: "name" },
          { source: "rh.birthdays", field: "birth_day", alias: "birth_day" },
        ],
        joins: [],
        filters: [
          {
            source: "rh.birthdays",
            field: "birth_month",
            operator: "eq",
            parameter: "month",
          },
          {
            source: "rh.birthdays",
            field: "department",
            operator: "eq",
            parameter: "department",
          },
        ],
        filter_groups: [],
        parameters: [
          { name: "month", type: "number" },
          { name: "department", type: "string" },
        ],
        aggregations: [],
        order_by: [],
      },
      parameter_values: { month: 7, department: "Financeiro" },
      organization_id: organizationId,
      limit: 50,
      request_id: "birthday-report",
    });

    expect(result).toEqual({
      rows: [{ name: "Colaboradora", birth_day: 30 }],
      reachedLimit: false,
    });
    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      source: "rh.birthdays",
      fields: ["name", "birth_day"],
      limit: 50,
      query: {
        filters: [
          { field: "birth_month", operator: "eq", parameter: "month", value: 7 },
          {
            field: "department",
            operator: "eq",
            parameter: "department",
            value: "Financeiro",
          },
        ],
      },
    });
    const grant = String((request.headers as Record<string, string>)["x-reports-grant"]);
    expect(createHmac("sha256", "grant-secret").update(grant).digest("hex")).toBe(
      (request.headers as Record<string, string>)["x-reports-grant-signature"],
    );
    expect(JSON.parse(Buffer.from(grant, "base64url").toString("utf8"))).toMatchObject({
      organization_id: organizationId,
      source: "rh.birthdays",
      fields: ["name", "birth_day", "birth_month", "department"],
    });

    const snapshots = {
      getForExport: vi.fn().mockResolvedValue({
        snapshot: { id: "snapshot-1910", created_at: new Date("2026-10-14T00:00:00Z") },
        job: { id: "job-1910", report_model_version_id: null, requester_id: "hr-manager" },
        rows: [],
        blocks: [
          {
            source: "rh.birthdays",
            label: "Aniversariantes por mês",
            columns: [
              { key: "name", label: "Colaborador" },
              { key: "birth_day", label: "Dia" },
            ],
            rows: result.rows,
          },
        ],
      }),
      assertExportable: vi.fn().mockResolvedValue(undefined),
    };
    const exported = await new ReportExportService(snapshots as never, {
      csv: new ReportCsvService(),
    }).export({
      snapshotId: "snapshot-1910",
      userId: "hr-manager",
      organizationId,
      requestId: "birthday-export",
      format: "csv",
    });
    expect(exported.body.toString("utf8")).toBe("Colaborador,Dia\r\nColaboradora,30\r\n");
  });
});
