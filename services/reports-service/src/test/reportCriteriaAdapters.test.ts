import { afterEach, describe, expect, it, vi } from "vitest";
import { CertificatePfAdapter } from "../integrations/certificatePfAdapter.js";
import { CertificatePjAdapter } from "../integrations/certificatePjAdapter.js";
import { ClientIntegrationAdapter } from "../integrations/clientIntegrationAdapter.js";
import { ContabilControlAdapter } from "../integrations/contabilControlAdapter.js";
import { ContabilRelationshipAdapter } from "../integrations/contabilRelationshipAdapter.js";
import { ContabilResponsiblesAdapter } from "../integrations/contabilResponsiblesAdapter.js";
import { FiscalIcmsAdapter } from "../integrations/fiscalIcmsAdapter.js";
import { FiscalIpiAdapter } from "../integrations/fiscalIpiAdapter.js";
import { FiscalNcmAdapter } from "../integrations/fiscalNcmAdapter.js";
import { ParcelamentoAdapter } from "../integrations/parcelamentoAdapter.js";
import { PessoalLddAdapter } from "../integrations/pessoalLddAdapter.js";
import { PessoalObligationsAdapter } from "../integrations/pessoalObligationsAdapter.js";
import { PessoalPayrollAdapter } from "../integrations/pessoalPayrollAdapter.js";
import { PessoalSituationsAdapter } from "../integrations/pessoalSituationsAdapter.js";
import { PessoalUnionsAdapter } from "../integrations/pessoalUnionsAdapter.js";
import { ProjectAdapter } from "../integrations/projectAdapter.js";
import { RegularizeLicenseAdapter } from "../integrations/regularizeLicenseAdapter.js";
import { RegularizeMunicipalTaxesAdapter } from "../integrations/regularizeMunicipalTaxesAdapter.js";
import { RegularizePortfolioAdapter } from "../integrations/regularizePortfolioAdapter.js";
import { RegularizeProcessAdapter } from "../integrations/regularizeProcessAdapter.js";
import { RhAttendanceAdapter } from "../integrations/rhAttendanceAdapter.js";
import { RhHolidayAdapter } from "../integrations/rhHolidayAdapter.js";
import { RhRequestAdapter } from "../integrations/rhRequestAdapter.js";
import { TaskAdapter } from "../integrations/taskAdapter.js";
import { TiExtensionsAdapter } from "../integrations/tiExtensionsAdapter.js";
import { TiInventoryAdapter } from "../integrations/tiInventoryAdapter.js";
import { TiRequestsAdapter } from "../integrations/tiRequestsAdapter.js";
import { TiStockAdapter } from "../integrations/tiStockAdapter.js";

const adapters = [
  CertificatePfAdapter,
  CertificatePjAdapter,
  ClientIntegrationAdapter,
  ContabilControlAdapter,
  ContabilRelationshipAdapter,
  ContabilResponsiblesAdapter,
  FiscalIcmsAdapter,
  FiscalIpiAdapter,
  FiscalNcmAdapter,
  ParcelamentoAdapter,
  PessoalLddAdapter,
  PessoalObligationsAdapter,
  PessoalPayrollAdapter,
  PessoalSituationsAdapter,
  PessoalUnionsAdapter,
  ProjectAdapter,
  RegularizeLicenseAdapter,
  RegularizeMunicipalTaxesAdapter,
  RegularizePortfolioAdapter,
  RegularizeProcessAdapter,
  RhAttendanceAdapter,
  RhHolidayAdapter,
  RhRequestAdapter,
  TaskAdapter,
  TiExtensionsAdapter,
  TiInventoryAdapter,
  TiRequestsAdapter,
  TiStockAdapter,
];

const env = new Proxy(
  {},
  {
    get: (_target, key) =>
      String(key).endsWith("Url")
        ? "http://source.test"
        : key === "sourceTimeoutMs"
          ? 1000
          : "fixture-secret",
  },
);
afterEach(() => vi.unstubAllGlobals());
for (const Adapter of adapters) {
  const adapter = new Adapter(env as never);
  for (const source of adapter.sources) {
    describe(source.key, () => {
      it("preserves an explicit capacity error from the origin", async () => {
        const field = source.fields[0];
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue({ ok: false, status: 422, json: async () => ({ success: false }) }),
        );
        await expect(
          adapter.preview({
            organization_id: "00000000-0000-4000-8000-000000000001",
            request_id: "capacity-test",
            limit: 10,
            definition: {
              sources: [source.key],
              columns: [{ source: source.key, field: field.key, alias: field.key }],
              filters: [],
              joins: [],
              parameters: [],
              filter_groups: [],
              order_by: [],
              aggregations: [],
            },
          }),
        ).rejects.toMatchObject({ statusCode: 422 });
      });
      it("preserves summary aliases returned by the origin", async () => {
        const field = source.fields[0];
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              success: true,
              data: { rows: [{ total: 150 }], reachedLimit: false },
            }),
          }),
        );
        const output = await adapter.preview({
          organization_id: "00000000-0000-4000-8000-000000000001",
          request_id: "summary-test",
          limit: 10,
          definition: {
            sources: [source.key],
            columns: [{ source: source.key, field: field.key, alias: field.key }],
            filters: [],
            joins: [],
            parameters: [],
            filter_groups: [],
            order_by: [],
            aggregations: [
              { source: source.key, field: field.key, function: "count", alias: "total" },
            ],
          },
        });
        expect("rows" in output ? output.rows : output).toEqual([{ total: 150 }]);
      });
      it("signs and forwards ordering fields even when not projected", async () => {
        const column = source.fields[0];
        const order = source.fields[1] ?? column;
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, data: { rows: [], reachedLimit: false } }),
        });
        vi.stubGlobal("fetch", fetchMock);
        await adapter.preview({
          organization_id: "00000000-0000-4000-8000-000000000001",
          request_id: "criteria-test",
          limit: 10,
          definition: {
            sources: [source.key],
            columns: [{ source: source.key, field: column.key, alias: column.key }],
            filters: [],
            joins: [],
            parameters: [],
            filter_groups: [],
            aggregations: [],
            order_by: [{ source: source.key, field: order.key, direction: "asc" }],
          },
        });
        const call = fetchMock.mock.calls[0][1];
        const body = JSON.parse(call.body);
        expect(body.query.order_by).toEqual([{ field: order.key, direction: "asc" }]);
        const grant = JSON.parse(
          Buffer.from(call.headers["x-reports-grant"], "base64url").toString("utf8"),
        );
        expect(grant.fields).toEqual([...new Set([column.key, order.key])]);
      });
    });
  }
}
