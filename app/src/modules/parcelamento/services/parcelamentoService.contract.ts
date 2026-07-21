import type {
  ParcelamentoListFilters,
  ParcelamentoListPage,
  ParcelamentoPage,
  ParcelamentoSuccessEnvelope,
  ParcelamentoTab,
} from "../types";

export const PARCELAMENTO_DEFAULT_PAGE = 1;
export const PARCELAMENTO_DEFAULT_PAGE_SIZE = 50;
export const PARCELAMENTO_MAX_PAGE_SIZE = 100;

export const PARCELAMENTO_ENDPOINTS = {
  installments: "/parcelamento/installments",
  installmentDetail: (id: string) => `/parcelamento/installments/${id}`,
  installmentCompetencies: (installmentId: string) =>
    `/parcelamento/installments/${installmentId}/competencies`,
  installmentCompetencyDetail: (id: string) => `/parcelamento/installment-competencies/${id}`,
  panoramas: "/parcelamento/panoramas",
  panoramaDetail: (id: string) => `/parcelamento/panoramas/${id}`,
  panoramaGenerate: (competence: string) =>
    `/parcelamento/panoramas/competences/${competence}/generate`,
} as const;

export const PARCELAMENTO_TABS: ParcelamentoTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "installments", label: "Parcelamentos" },
  { id: "competencies", label: "Competencias" },
  { id: "panoramas", label: "Panoramas" },
];

export function unwrapParcelamentoEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as ParcelamentoSuccessEnvelope<T>).data;
  }

  return body as T;
}

export function unwrapParcelamentoPage<T>(body: unknown): ParcelamentoListPage<T> {
  const page = unwrapParcelamentoEnvelope<ParcelamentoPage<T>>(body);

  return {
    ...page,
    data: page.items,
    pageSize: page.page_size,
    hasMore: page.has_more,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizePage(value: unknown) {
  const page = Math.trunc(Number(value ?? PARCELAMENTO_DEFAULT_PAGE));

  return Number.isFinite(page) && page > 0 ? page : PARCELAMENTO_DEFAULT_PAGE;
}

function normalizePageSize(value: unknown) {
  const pageSize = Math.trunc(Number(value ?? PARCELAMENTO_DEFAULT_PAGE_SIZE));
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : PARCELAMENTO_DEFAULT_PAGE_SIZE;

  return Math.min(PARCELAMENTO_MAX_PAGE_SIZE, safePageSize);
}

export function buildParcelamentoListParams(filters: ParcelamentoListFilters = {}) {
  const params: Record<string, string | number> = {
    page: normalizePage(filters.page),
    page_size: normalizePageSize(filters.page_size),
  };
  const filterKeys = [
    "client_id",
    "status",
    "type",
    "jurisdiction",
    "search",
    "competence",
    "responsavel_id",
  ] as const;

  for (const key of filterKeys) {
    const value = normalizeText(filters[key]);

    if (typeof value === "string" && value.length > 0) {
      params[key] = value;
    }
  }

  return params;
}

export function buildParcelamentoPatchPayload<T extends Record<string, unknown>>(payload: T) {
  const nextPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      return !(typeof value === "string" && value.trim().length === 0) && value !== undefined;
    }),
  ) as Partial<T>;

  if (Object.keys(nextPayload).length === 0) {
    throw new Error("Informe ao menos um campo para atualizar.");
  }

  return nextPayload;
}
