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

export const REGULARIZE_ENDPOINTS = {
  passwords: "/regularize/passwords",
  password: "/regularize/password",
  sitesPass: "/regularize/sites-pass",
  sitesPassDetail: "/regularize/sites-pass-detail",
  pf: "/regularize/pf",
  pfs: "/regularize/pfs",
  partners: "/regularize/partners",
  partner: "/regularize/partner",
  municipalTaxes: "/regularize/municipal-taxes",
  municipalTaxesDetail: "/regularize/municipal-taxes-detail",
  processes: "/regularize/processes",
  process: "/regularize/process",
  guidanceList: "/regularize/guidance/list",
  guidanceDetail: "/regularize/guidance/detail",
  guidance: "/regularize/guidance",
  guidanceActivityAdd: "/regularize/guidance/activity/add",
  guidanceActivityRemove: "/regularize/guidance/activity/remove",
  guidancePartnerAdd: "/regularize/guidance/partner/add",
  guidancePartnerRemove: "/regularize/guidance/partner/remove",
  licenses: "/regularize/licenses",
  license: "/regularize/license",
} as const;

export function buildRegularizeIdParams(id: RegularizeId | undefined | null) {
  return {
    id: id || undefined,
  };
}

export function buildRegularizePasswordListParams(
  filters: RegularizePasswordListFilters,
) {
  return {
    client_id: filters.client_id,
  };
}

export function buildRegularizeSitePasswordListParams(
  filters: RegularizeSitePasswordListFilters,
) {
  return {
    status: filters.status,
  };
}

export function buildRegularizeClientPfListParams(
  filters: RegularizeClientPfListFilters,
) {
  return {
    status: filters.status,
  };
}

export function buildRegularizePartnerListParams(filters: RegularizePartnerListFilters) {
  return {
    type: filters.type,
    client_id: filters.client_id,
  };
}

export function buildRegularizeMunicipalTaxesListParams(
  filters: RegularizeMunicipalTaxesListFilters,
) {
  return {
    year: filters.year,
  };
}

export function buildRegularizeProcessListParams(filters: RegularizeProcessListFilters) {
  return {
    status: filters.status,
  };
}

export function buildRegularizeGuidanceListParams(filters: RegularizeGuidanceListFilters) {
  return {
    process_id: filters.process_id,
  };
}

export function buildRegularizeLicenseListParams(filters: RegularizeLicenseListFilters) {
  return {
    status: filters.status,
  };
}

export function unwrapRegularizeEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export function unwrapRegularizeEntity<T>(body: unknown, key = "detail"): T {
  const data = unwrapRegularizeEnvelope<Record<string, unknown> | T>(body);

  if (data !== null && typeof data === "object" && key in data) {
    return (data as Record<string, T>)[key];
  }

  return data as T;
}
