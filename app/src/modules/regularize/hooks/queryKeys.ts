import type {
  RegularizeClientPfListFilters,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseListFilters,
  RegularizeMunicipalTaxesListFilters,
  RegularizePartnerListFilters,
  RegularizePasswordListFilters,
  RegularizeProcessListFilters,
  RegularizeSitePasswordListFilters,
} from "../types";

export const regularizeQueryKeys = {
  root: ["regularize"] as const,
  dashboardRoot: () => [...regularizeQueryKeys.root, "dashboard"] as const,
  dashboard: (year: number) => [...regularizeQueryKeys.dashboardRoot(), year] as const,
  credentials: () => [...regularizeQueryKeys.root, "credentials"] as const,
  sitePasswords: (filters: RegularizeSitePasswordListFilters) =>
    [...regularizeQueryKeys.credentials(), "sites", filters.status] as const,
  sitePasswordDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.credentials(), "sites", "detail", id ?? ""] as const,
  passwords: (filters: RegularizePasswordListFilters) =>
    [...regularizeQueryKeys.credentials(), "passwords", filters.client_id] as const,
  passwordDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.credentials(), "passwords", "detail", id ?? ""] as const,
  people: () => [...regularizeQueryKeys.root, "people"] as const,
  clientPfs: (filters: RegularizeClientPfListFilters) =>
    [...regularizeQueryKeys.people(), "client-pfs", filters.status] as const,
  clientPfDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.people(), "client-pfs", "detail", id ?? ""] as const,
  partners: (filters: RegularizePartnerListFilters) =>
    [
      ...regularizeQueryKeys.people(),
      "partners",
      filters.type,
      filters.client_id,
    ] as const,
  partnerDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.people(), "partners", "detail", id ?? ""] as const,
  operations: () => [...regularizeQueryKeys.root, "operations"] as const,
  municipalTaxes: (filters: RegularizeMunicipalTaxesListFilters) =>
    [...regularizeQueryKeys.operations(), "municipal-taxes", filters.year] as const,
  municipalTaxDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.operations(), "municipal-taxes", "detail", id ?? ""] as const,
  processes: (filters: RegularizeProcessListFilters) =>
    [...regularizeQueryKeys.operations(), "processes", filters.status] as const,
  processDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.operations(), "processes", "detail", id ?? ""] as const,
  guidance: (filters: RegularizeGuidanceListFilters) =>
    [...regularizeQueryKeys.operations(), "guidance", filters.process_id] as const,
  guidanceDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.operations(), "guidance", "detail", id ?? ""] as const,
  licenses: (filters: RegularizeLicenseListFilters) =>
    [...regularizeQueryKeys.operations(), "licenses", filters.status] as const,
  licenseDetail: (id?: RegularizeId | null) =>
    [...regularizeQueryKeys.operations(), "licenses", "detail", id ?? ""] as const,
};
