import { DEFAULT_CERTIFICATE_PAGE_SIZE } from "../services/certificateService.contract.ts";

export const CERTIFICATE_QUERY_KEY = ["certificates"] as const;

function boolToQueryValue(value?: boolean) {
  if (value === undefined) {
    return "";
  }
  return value ? "true" : "false";
}

export function certificatePjListQueryKey(filters: {
  page?: number;
  page_size?: number;
  name?: string;
  cnpj?: string;
  responsible?: string;
  model?: string;
  client_castelo_status?: boolean;
  client_focus_status?: boolean;
  was_paid?: boolean;
  has_certificate?: boolean;
}) {
  return [
    ...CERTIFICATE_QUERY_KEY,
    "pj",
    "list",
    filters.page ?? 1,
    filters.page_size ?? DEFAULT_CERTIFICATE_PAGE_SIZE,
    filters.name ?? "",
    filters.cnpj ?? "",
    filters.responsible ?? "",
    filters.model ?? "",
    boolToQueryValue(filters.client_castelo_status),
    boolToQueryValue(filters.client_focus_status),
    boolToQueryValue(filters.was_paid),
    boolToQueryValue(filters.has_certificate),
  ] as const;
}
export function certificatePfListQueryKey(filters: {
  page?: number;
  page_size?: number;
  search?: string;
  name?: string;
  cpf?: string;
  enterprise?: string;
  cnpj?: string;
  model?: string;
  client_castelo_status?: boolean;
  client_focus_status?: boolean;
  was_paid?: boolean;
  has_certificate?: boolean;
}) {
  return [
    ...CERTIFICATE_QUERY_KEY,
    "pf",
    "list",
    filters.page ?? 1,
    filters.page_size ?? DEFAULT_CERTIFICATE_PAGE_SIZE,
    filters.search ?? "",
    filters.name ?? "",
    filters.cpf ?? "",
    filters.enterprise ?? "",
    filters.cnpj ?? "",
    filters.model ?? "",
    boolToQueryValue(filters.client_castelo_status),
    boolToQueryValue(filters.client_focus_status),
    boolToQueryValue(filters.was_paid),
    boolToQueryValue(filters.has_certificate),
  ] as const;
}

export function certificatePjDetailQueryKey(id: string) {
  return [...CERTIFICATE_QUERY_KEY, "pj", "detail", id] as const;
}

export function certificatePfDetailQueryKey(id: string) {
  return [...CERTIFICATE_QUERY_KEY, "pf", "detail", id] as const;
}

export function certificateNotificationsQueryKey(params: { page?: number; page_size?: number }) {
  return [
    ...CERTIFICATE_QUERY_KEY,
    "notifications",
    "list",
    params.page ?? 1,
    params.page_size ?? DEFAULT_CERTIFICATE_PAGE_SIZE,
  ] as const;
}
