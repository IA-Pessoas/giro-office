import { regularizeLicenseReportingCatalog } from "./regularizeLicenseReportingCatalog.js";
import { regularizeProcessReportingCatalog } from "./regularizeProcessReportingCatalog.js";

export const REGULARIZE_REPORTING_SOURCES = [
  "regularize.licenses",
  "regularize.processes",
] as const;

export const regularizeReportingCatalog = {
  sources: [
    ...regularizeLicenseReportingCatalog.sources,
    ...regularizeProcessReportingCatalog.sources,
  ],
  relations: [],
} as const;
