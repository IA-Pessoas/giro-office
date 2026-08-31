import {
  PESSOAL_LDD_REPORTING_SOURCES,
  PESSOAL_PAYROLL_REPORTING_SOURCES,
  PESSOAL_SITUATIONS_REPORTING_SOURCES,
  type PessoalLddReportingSource,
  type PessoalPayrollReportingSource,
  type PessoalSituationsReportingSource,
  pessoalLddReportingCatalog,
  pessoalPayrollReportingCatalog,
  pessoalSituationsReportingCatalog,
} from "@workspace/shared";

export const PESSOAL_REPORTING_SOURCES = [
  ...PESSOAL_LDD_REPORTING_SOURCES,
  ...PESSOAL_PAYROLL_REPORTING_SOURCES,
  ...PESSOAL_SITUATIONS_REPORTING_SOURCES,
] as const;
export type PessoalReportingSource =
  | PessoalLddReportingSource
  | PessoalPayrollReportingSource
  | PessoalSituationsReportingSource;

export const pessoalReportingCatalog = {
  sources: [
    ...pessoalLddReportingCatalog.sources,
    ...pessoalPayrollReportingCatalog.sources,
    ...pessoalSituationsReportingCatalog.sources,
  ],
  relations: [],
} as const;

export function getPessoalReportingFields(source: PessoalReportingSource): readonly string[] {
  return (
    pessoalReportingCatalog.sources
      .find((candidate) => candidate.key === source)
      ?.fields.map((candidate) => candidate.key) ?? []
  );
}
