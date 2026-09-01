import {
  RH_HOLIDAY_REPORTING_SOURCES,
  RH_REQUEST_REPORTING_SOURCES,
  rhHolidayReportingCatalog,
  rhRequestReportingCatalog,
} from "@workspace/shared";

export const RH_REPORTING_SOURCES = [
  ...RH_REQUEST_REPORTING_SOURCES,
  ...RH_HOLIDAY_REPORTING_SOURCES,
] as const;
export type RhReportingSource = (typeof RH_REPORTING_SOURCES)[number];

export const rhReportingCatalog = {
  sources: [...rhRequestReportingCatalog.sources, ...rhHolidayReportingCatalog.sources],
  relations: [],
} as const;
