import type { PessoalSuccessEnvelope, PessoalTab } from "../types";
import type { PaginatedResult } from "@shared/pagination/pagination";

export const PESSOAL_ENDPOINTS = {
  ldd: "/pessoal/ldd",
  lddDetail: (id: string) => `/pessoal/ldd/${id}`,
  overview: "/pessoal/overview",
  groups: "/pessoal/groups",
  groupDetail: (id: string) => `/pessoal/groups/${id}`,
  groupReactivate: (id: string) => `/pessoal/groups/${id}/reactivate`,
  groupAssignmentEligible: "/pessoal/group-assignments/eligible",
  groupAssignmentPreviews: "/pessoal/group-assignments/previews",
  groupAssignmentPreview: (id: string) => `/pessoal/group-assignments/previews/${id}`,
  groupAssignmentApply: "/pessoal/group-assignments/apply",
  situations: "/pessoal/situations",
  situationDetail: (id: string) => `/pessoal/situations/${id}`,
  unions: "/pessoal/unions",
  unionDetail: (id: string) => `/pessoal/unions/${id}`,
  payroll: "/pessoal/payroll",
  payrollDetail: (clientId: string) => `/pessoal/payroll/${clientId}`,
  obligations: "/pessoal/obrigations",
  obligationPortfolio: "/pessoal/obrigations/portfolio",
  obligationDetail: (id: string) => `/pessoal/obrigations/${id}`,
  obligationGenerate: (competence: string) =>
    `/pessoal/obrigations/competences/${competence}/generate`,
  passwords: "/pessoal/passwords",
  passwordDetail: (id: string) => `/pessoal/passwords/${id}`,
} as const;

export const PESSOAL_TABS: PessoalTab[] = [
  { id: "overview", label: "Visão geral" },
  { id: "groups", label: "Grupos" },
  { id: "groupAssignments", label: "Atribuição em lote" },
  { id: "unions", label: "Sindicatos" },
  { id: "payroll", label: "Folha" },
  { id: "obligations", label: "Obrigações" },
  { id: "tracking", label: "Acompanhamentos" },
  { id: "passwords", label: "Senhas" },
];

export function unwrapPessoalEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as PessoalSuccessEnvelope<T>).data;
  }

  return body as T;
}

export function unwrapPessoalPage<T>(
  body: unknown,
  fallback: { page: number; limit: number },
): PaginatedResult<T> {
  const data = unwrapPessoalEnvelope<T[] | PaginatedResult<T>>(body);

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
