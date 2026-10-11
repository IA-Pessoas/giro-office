import type {
  RegularizeClientPfListFilters,
  RegularizeDteNoticeListFilters,
  RegularizeGuidanceListFilters,
  RegularizeId,
  RegularizeLicenseListFilters,
  RegularizeMunicipalTaxesListFilters,
  RegularizePartnerListFilters,
  RegularizePasswordListFilters,
  RegularizeProcessListFilters,
  RegularizeSitePasswordListFilters,
} from "../types";
import type { PaginatedResult } from "@shared/pagination/pagination";

export const REGULARIZE_ENDPOINTS = {
  dashboard: "/regularize/dashboard",
  passwords: "/regularize/passwords",
  password: "/regularize/password",
  sitesPass: "/regularize/sites-pass",
  sitesPassDetail: "/regularize/sites-pass-detail",
  pf: "/regularize/pf",
  pfs: "/regularize/pfs",
  partners: "/regularize/partners",
  deletePartner: (id: RegularizeId) => `/regularize/partners/${id}`,
  partner: "/regularize/partner",
  groupMap: (groupId: RegularizeId) => `/regularize/groups/${groupId}/map`,
  groupMapSaved: (groupId: RegularizeId) => `/regularize/groups/${groupId}/map/saved`,
  municipalTaxes: "/regularize/municipal-taxes",
  municipalTaxesDetail: "/regularize/municipal-taxes-detail",
  dteImport: "/regularize/dte/import",
  dteImports: "/regularize/dte/imports",
  dteNotices: "/regularize/dte/notices",
  dteNoticeReading: "/regularize/dte/notices/reading",
  dteQueries: "/regularize/dte/queries",
  dteQueryStatus: "/regularize/dte/queries/status",
  dteQueryImport: "/regularize/dte/queries/import",
  processes: "/regularize/processes",
  process: "/regularize/process",
  sendToFiscal: "/regularize/process/send-to-fiscal",
  returnFromFiscal: "/regularize/process/return-from-fiscal",
  guidanceList: "/regularize/guidance/list",
  guidanceDetail: "/regularize/guidance/detail",
  guidancePdf: "/regularize/guidance/pdf",
  guidance: "/regularize/guidance",
  guidanceActivityAdd: "/regularize/guidance/activity/add",
  guidanceActivityRemove: "/regularize/guidance/activity/remove",
  guidanceActivity: "/regularize/guidance/activity",
  guidancePartnerAdd: "/regularize/guidance/partner/add",
  guidancePartnerRemove: "/regularize/guidance/partner/remove",
  guidancePartner: "/regularize/guidance/partner",
  licenses: "/regularize/licenses",
  license: "/regularize/license",
  licenseProtocol: (id: RegularizeId) => `/regularize/license/${id}/protocol`,
} as const;

export function buildRegularizeDashboardParams(year: number) {
  return { year };
}

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
    ...(filters.search ? { search: filters.search.trim() } : {}),
    ...(filters.page !== undefined ? { page: filters.page } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
}

export function buildRegularizeClientPfListParams(
  filters: RegularizeClientPfListFilters,
) {
  return {
    status: filters.status,
    ...(filters.search ? { search: filters.search.trim() } : {}),
    ...(filters.page !== undefined ? { page: filters.page } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
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
    ...(filters.search ? { search: filters.search.trim() } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.page !== undefined ? { page: filters.page } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
}

// Opção "Sem cor" do filtro: a API recebe tipo vazio, que no select já significa "todas".
export const REGULARIZE_DTE_NO_TIPO_FILTER = "sem-cor";

// Sem "Emitido de", a caixa mostra tudo (o ?todos do legado). A API aplica 45 dias quando o
// from não vem, então o filtro vazio vai como uma data anterior a qualquer aviso.
export const REGULARIZE_DTE_ALL_PERIOD_FROM = "1900-01-01";

// from e to vão como dia (aaaa-mm-dd): a emissão do aviso é comparada pelo dia, sem fuso.
export function buildRegularizeDteNoticeListParams(filters: RegularizeDteNoticeListFilters) {
  return {
    from: filters.from || REGULARIZE_DTE_ALL_PERIOD_FROM,
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.tipo
      ? { tipo: filters.tipo === REGULARIZE_DTE_NO_TIPO_FILTER ? "" : filters.tipo }
      : {}),
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    reading: filters.reading,
    page: filters.page,
    limit: filters.limit,
  };
}

export function buildRegularizeProcessListParams(filters: RegularizeProcessListFilters) {
  return {
    status: filters.status,
    ...(filters.search ? { search: filters.search.trim() } : {}),
    ...(filters.page !== undefined ? { page: filters.page } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
  };
}

export function buildRegularizeGuidanceListParams(filters: RegularizeGuidanceListFilters) {
  return {
    ...(filters.process_id ? { process_id: filters.process_id } : {}),
    ...(filters.target_type ? { target_type: filters.target_type } : {}),
  };
}

export function buildRegularizeLicenseListParams(filters: RegularizeLicenseListFilters) {
  return {
    status: filters.status,
    ...(filters.page !== undefined ? { page: filters.page } : {}),
    ...(filters.limit !== undefined ? { limit: filters.limit } : {}),
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

export function unwrapRegularizePage<T>(
  body: unknown,
  fallback: { page: number; limit: number },
): PaginatedResult<T> {
  const data = unwrapRegularizeEnvelope<T[] | PaginatedResult<T>>(body);

  if (Array.isArray(data)) {
    return {
      data,
      total: data.length,
      page: fallback.page,
      limit: fallback.limit,
      hasMore: false,
    };
  }

  return data;
}
