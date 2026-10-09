import { describe, expect, it } from "vitest";
import { reportingSources } from "../../../../shared/src/reporting/reportingSources.js";
import { InternalReportingService as Certificate } from "../../../certificate-service/src/services/internalReportingService.js";
import { ClientIntegrationReportingService as Client } from "../../../client-service/src/services/clientIntegrationReportingService.js";
import { InternalReportingService as Contabil } from "../../../contabil-service/src/services/internalReportingService.js";
import { InternalReportingService as Fiscal } from "../../../fiscal-service/src/reporting/internalReportingService.js";
import { InternalReportingService as Parcelamento } from "../../../parcelamento-service/src/services/internalReportingService.js";
import { InternalReportingService as Pessoal } from "../../../pessoal-service/src/reporting/internalReportingService.js";
import { InternalReportingService as Project } from "../../../project-service/src/services/internalReportingService.js";
import {
  RegularizeMunicipalTaxesReportingService as Municipal,
  RegularizeLicenseReportingService as Regularize,
} from "../../../regularize-service/src/reporting/internalReportingService.js";
import { InternalReportingService as Rh } from "../../../rh-service/src/reporting/internalReportingService.js";
import { TaskReportingService as Task } from "../../../task-service/src/services/taskReportingService.js";
import { InternalReportingService as Ti } from "../../../ti-service/src/reporting/internalReportingService.js";

const organizationId = "00000000-0000-4000-8000-000000000001";
const pessoalDerivedFields = new Set([
  "client_name",
  "client_code",
  "client_document",
  "client_status",
  "responsible_name",
  "union_name",
  "group_name",
  "group_state",
  "group_snapshot_state",
]);
it("rh.attendance: filters derived rows beyond 101 and counts the complete set", async () => {
  const points = Array.from({ length: 150 }, (_, index) => ({
    id: `point-${String(index).padStart(3, "0")}`,
    clock_in: new Date(2026, 0, 1, 0, index),
    clock_out: index === 149 ? new Date(2026, 0, 2) : null,
  }));
  const empty = { findMany: async () => [] };
  const service = new Rh({
    $transaction: async function (read) {
      return read(this);
    },
    point: {
      findMany: async ({ take, skip = 0, cursor }) => {
        const cursorIndex = cursor ? points.findIndex((point) => point.id === cursor.id) : -1;
        const start = cursorIndex < 0 ? skip : cursorIndex + skip;
        return points.slice(start, start + take);
      },
    },
    timeSheets: empty,
    timeBankReleases: empty,
    timeClockRequest: empty,
  });
  const result = await service.extract({
    source: "rh.attendance",
    organizationId,
    fields: ["status"],
    limit: 1,
    query: {
      filters: [{ field: "status", operator: "eq", parameter: "status", value: "Completo" }],
    },
  });
  expect(result.rows).toEqual([{ status: "Completo" }]);
  const count = await service.extract({
    source: "rh.attendance",
    organizationId,
    fields: ["status"],
    limit: 1,
    query: { aggregations: [{ field: "status", function: "count", alias: "total" }] },
  });
  expect(count.rows).toEqual([{ total: 150 }]);
});
for (const source of reportingSources.filter(
  (source) =>
    source.key !== "rh.attendance" &&
    source.key !== "marketing.budgets" &&
    source.key !== "integracao.client_groups",
)) {
  describe(source.key, () => {
    it("orders the entire authorized set before the output cap", async () => {
      const field =
        source.fields.find(
          (field) => field.value_type === "string" && !pessoalDerivedFields.has(field.key),
        ) ??
        source.fields.find((field) => !pessoalDerivedFields.has(field.key)) ??
        source.fields[0];
      const value = (index: number) =>
        field.value_type === "boolean" ? index === 149 : `Value ${String(index).padStart(3, "0")}`;
      const hasCursor =
        source.key.startsWith("ti.") ||
        source.key.startsWith("regularize.") ||
        source.key.startsWith("pessoal.") ||
        source.key.startsWith("fiscal.") ||
        source.key.startsWith("rh.");
      const rows = Array.from({ length: 150 }, (_, index) => ({
        ...(hasCursor ? { id: `row-${String(index).padStart(3, "0")}` } : {}),
        [field.key]: value(index),
        organization_id: organizationId,
      }));
      rows.push({
        ...(hasCursor ? { id: "row-foreign" } : {}),
        [field.key]: "ZZZ foreign",
        organization_id: "foreign",
      });
      const delegate = {
        findFirst: async () => ({ id: "technology" }),
        findMany: async ({
          where,
          take,
          select,
          skip = 0,
          cursor,
        }: {
          where: { organization_id: string };
          take: number;
          skip?: number;
          cursor?: { id: string };
          select: Record<string, unknown>;
        }) => {
          const authorizedRows = rows.filter(
            (row) => row.organization_id === where.organization_id,
          );
          const cursorIndex = cursor ? authorizedRows.findIndex((row) => row.id === cursor.id) : -1;
          const start = cursorIndex < 0 ? skip : cursorIndex + skip;
          return authorizedRows
            .slice(start, start + take)
            .map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])));
        },
      };
      const emptyDelegate = { findMany: async () => [] };
      const prisma = new Proxy<Record<PropertyKey, unknown>>(
        {},
        {
          has: (_target, key) => key === "$transaction",
          get: (_target, key) =>
            key === "$transaction"
              ? async (read: (transaction: unknown) => Promise<unknown>) => read(prisma)
              : source.key === "rh.attendance" && key !== "point"
                ? emptyDelegate
                : delegate,
        },
      );
      const Service =
        source.key === "integracao.projects"
          ? Project
          : source.key === "integracao.tasks"
            ? Task
            : source.key === "integracao.clients"
              ? Client
              : source.key.startsWith("rh.")
                ? Rh
                : source.key.startsWith("fiscal.")
                  ? Fiscal
                  : source.key.startsWith("pessoal.")
                    ? Pessoal
                    : source.key.startsWith("certificado.")
                      ? Certificate
                      : source.key.startsWith("contabil.")
                        ? Contabil
                        : source.key.startsWith("parcelamento.")
                          ? Parcelamento
                          : source.key.startsWith("ti.")
                            ? Ti
                            : source.key === "regularize.municipal_taxes"
                              ? Municipal
                              : Regularize;
      const service = new Service(prisma as never);
      const output = await service.extract({
        source: source.key,
        organizationId,
        fields: [field.key],
        limit: 1,
        query: { order_by: [{ field: field.key, direction: "desc" }] },
      } as never);
      const result = "rows" in output ? output.rows : output;
      expect(result).toEqual([{ [field.key]: value(149) }]);
      const counted = await service.extract({
        source: source.key,
        organizationId,
        fields: [field.key],
        limit: 1,
        query: {
          group_by: [],
          aggregations: [{ field: field.key, function: "count", alias: "total" }],
        },
      } as never);
      expect("rows" in counted ? counted.rows : counted).toEqual([{ total: 150 }]);
      if (field.filter_operators.includes("eq")) {
        const filtered = await service.extract({
          source: source.key,
          organizationId,
          fields: [field.key],
          limit: 1,
          query: {
            filters: [
              { field: field.key, operator: "eq", parameter: "match", value: value(149) },
              {
                field: field.key,
                operator: "eq",
                parameter: "foreign",
                value: field.value_type === "boolean" ? true : "ZZZ foreign",
              },
            ],
            filter_groups: [{ operator: "or", filters: ["match", "foreign"] }],
          },
        } as never);
        expect("rows" in filtered ? filtered.rows : filtered).toEqual([
          { [field.key]: value(149) },
        ]);
      }
    });
  });
}
