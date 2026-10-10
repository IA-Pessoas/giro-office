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
import { useAuth } from "@/context/AuthContext";

export type RegularizeQueryScope = {
  organizationId: string;
  userId: string;
};

export const regularizeQueryKeys = {
  root: ["regularize"] as const,
  scopedRoot: (scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.root, scope.organizationId, scope.userId] as const,
  dashboardRoot: (scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.scopedRoot(scope), "dashboard"] as const,
  dashboard: (year: number, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.dashboardRoot(scope), year] as const,
  credentials: (scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.scopedRoot(scope), "credentials"] as const,
  sitePasswords: (filters: RegularizeSitePasswordListFilters, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.credentials(scope), "sites", filters.status] as const,
  sitePasswordsPage: (
    filters: RegularizeSitePasswordListFilters,
    scope: RegularizeQueryScope,
  ) =>
    [
      ...regularizeQueryKeys.credentials(scope),
      "sites-page",
      filters.status,
      filters.search ?? "",
      filters.page ?? 1,
      filters.limit ?? 20,
    ] as const,
  sitePasswordDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.credentials(scope), "sites", "detail", id ?? ""] as const,
  passwords: (filters: RegularizePasswordListFilters, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.credentials(scope), "passwords", filters.client_id] as const,
  passwordDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.credentials(scope), "passwords", "detail", id ?? ""] as const,
  people: (scope: RegularizeQueryScope) => [...regularizeQueryKeys.scopedRoot(scope), "people"] as const,
  clientPfsPage: (filters: RegularizeClientPfListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.people(scope),
      "client-pfs-page",
      filters.status,
      filters.search ?? "",
      filters.page ?? 1,
      filters.limit ?? 20,
    ] as const,
  clientPfDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.people(scope), "client-pfs", "detail", id ?? ""] as const,
  partners: (filters: RegularizePartnerListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.people(scope),
      "partners",
      filters.type,
      filters.client_id,
    ] as const,
  partnerDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.people(scope), "partners", "detail", id ?? ""] as const,
  // Sob "people": mudar sócio ou PF refaz o mapa.
  groupMap: (groupId: RegularizeId, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.people(scope), "group-map", groupId] as const,
  groupMapSaved: (groupId: RegularizeId, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.people(scope), "group-map-saved", groupId] as const,
  operations: (scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.scopedRoot(scope), "operations"] as const,
  municipalTaxes: (filters: RegularizeMunicipalTaxesListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.operations(scope),
      "municipal-taxes",
      filters.year,
      filters.search ?? "",
      filters.status ?? "Todos",
      filters.type ?? "Todos",
      filters.page ?? 1,
      filters.limit ?? 20,
    ] as const,
  municipalTaxDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.operations(scope), "municipal-taxes", "detail", id ?? ""] as const,
  processes: (filters: RegularizeProcessListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.operations(scope),
      "processes",
      filters.status,
      filters.search ?? "",
    ] as const,
  processesPage: (filters: RegularizeProcessListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.operations(scope),
      "processes-page",
      filters.status,
      filters.search ?? "",
      filters.page ?? 1,
      filters.limit ?? 20,
    ] as const,
  processDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.operations(scope), "processes", "detail", id ?? ""] as const,
  guidance: (filters: RegularizeGuidanceListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.operations(scope),
      "guidance",
      filters.process_id ?? "",
      filters.target_type ?? "",
    ] as const,
  guidanceDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.operations(scope), "guidance", "detail", id ?? ""] as const,
  licenses: (filters: RegularizeLicenseListFilters, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.operations(scope), "licenses", filters.status] as const,
  licensesPage: (filters: RegularizeLicenseListFilters, scope: RegularizeQueryScope) =>
    [
      ...regularizeQueryKeys.operations(scope),
      "licenses-page",
      filters.status,
      filters.page ?? 1,
      filters.limit ?? 20,
    ] as const,
  licenseDetail: (id: RegularizeId | undefined | null, scope: RegularizeQueryScope) =>
    [...regularizeQueryKeys.operations(scope), "licenses", "detail", id ?? ""] as const,
};

export function useRegularizeQueryScope(): RegularizeQueryScope {
  const { user } = useAuth();

  return {
    organizationId: user?.organization_id ?? "anonymous",
    userId: user?.id ?? "anonymous",
  };
}
