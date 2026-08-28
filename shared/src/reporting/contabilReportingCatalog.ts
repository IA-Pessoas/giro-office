import {
  CONTABIL_CONTROL_REPORTING_SOURCES,
  contabilControlReportingCatalog,
} from "./contabilControlReportingCatalog.js";
import {
  CONTABIL_RESPONSIBLES_REPORTING_SOURCES,
  contabilResponsiblesReportingCatalog,
} from "./contabilResponsiblesReportingCatalog.js";

export const CONTABIL_REPORTING_SOURCES = [
  ...CONTABIL_CONTROL_REPORTING_SOURCES,
  ...CONTABIL_RESPONSIBLES_REPORTING_SOURCES,
] as const;
export type ContabilReportingSource = (typeof CONTABIL_REPORTING_SOURCES)[number];

export const contabilReportingCatalog = {
  sources: [
    ...contabilControlReportingCatalog.sources,
    ...contabilResponsiblesReportingCatalog.sources,
  ],
  relations: [],
} as const;

export function getContabilReportingFields(source: ContabilReportingSource): readonly string[] {
  return (
    contabilReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
