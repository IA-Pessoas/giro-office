import assert from "node:assert/strict";
import test from "node:test";
import { reportingSources } from "../src/reporting/reportingSources.ts";
import {
  RH_VACATION_REPORTING_SOURCES,
  rhVacationReportingCatalog,
} from "../src/reporting/rhVacationReportingCatalog.ts";

test("publica o histórico de férias como fonte somente de leitura para gestores de RH", () => {
  assert.deepEqual(RH_VACATION_REPORTING_SOURCES, ["rh.vacationHistory"]);
  assert.ok(reportingSources.some((source) => source.key === "rh.vacationHistory"));
  assert.deepEqual(
    {
      key: rhVacationReportingCatalog.sources[0]?.key,
      module: rhVacationReportingCatalog.sources[0]?.module,
      minimum_permission: rhVacationReportingCatalog.sources[0]?.minimum_permission,
      keys: rhVacationReportingCatalog.sources[0]?.keys,
    },
    {
      key: "rh.vacationHistory",
      module: "rh",
      minimum_permission: 3,
      keys: [],
    },
  );
  assert.deepEqual(
    rhVacationReportingCatalog.sources[0]?.fields.map(({ key }) => key),
    ["employee_name", "period_start", "period_end", "acquisition_start", "acquisition_end", "uses"],
  );
});
