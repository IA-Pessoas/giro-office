import { normalizeCpfCnpj } from "@workspace/shared";
import type { Prisma } from "../generated/prisma/client.js";

export type ListRefFilter = "integracao" | "deps" | undefined;

const DEPARTMENT_FIELD_NAMES = new Set([
  "contabil",
  "fiscal",
  "pessoal",
  "infoproduto",
  "consultoria",
  "castelo_med",
]);

const NOT_CONTRACTED_AND_PAUSED_STATUSES = new Set([
  "Não Contradados e Paralisados",
  "Não Contradado e Paralisado",
]);

/**
 * Constrói o filtro `where` alinhado ao legado `ClientService.list` (com `organization_id` aplicado depois).
 */
export function buildLegacyListStatusWhere(
  ref: ListRefFilter,
  status: string | undefined,
): Prisma.ClientWhereInput | undefined {
  if (!status || status === "Todos") {
    return undefined;
  }

  if (ref === "integracao") {
    if (status === "Ativo" || status === "Inativo") {
      return {
        AND: [{ status }, { dominio_code: { not: null } }, { dominio_code: { not: "" } }],
      };
    }
    if (status === "Ativo e Prospecção") {
      return { status: { in: ["Fechado", "Prospecção"] } };
    }
    if (
      status === "Ativo PJ" ||
      status === "Prospecção PJ" ||
      status === "Inativo PJ" ||
      status === "Ativo PF" ||
      status === "Prospecção PF" ||
      status === "Inativo PF"
    ) {
      const parts = status.split(" ");
      const statusPart = parts[0];
      const typePart = parts[1];
      if (statusPart && typePart) {
        return { status: statusPart, type: typePart };
      }
    }
    if (NOT_CONTRACTED_AND_PAUSED_STATUSES.has(status)) {
      return {
        prospecting_status: { in: ["Paralisado", "Recusado pelo Cliente"] },
      };
    }
    return { status };
  }

  if (ref === "deps") {
    const parts = status.split(" ");
    if (parts[0] === "Departamento" && parts[1]) {
      const fieldName = parts[1];
      if (DEPARTMENT_FIELD_NAMES.has(fieldName)) {
        return {
          [fieldName]: true,
          status: "Ativo",
        } as Prisma.ClientWhereInput;
      }
    }
    return undefined;
  }

  return undefined;
}

export function mergeClientListSearchWhere(
  base: Prisma.ClientWhereInput,
  search: string | undefined,
): Prisma.ClientWhereInput {
  const term = search?.trim();
  if (!term) {
    return base;
  }
  const documentTerm = /^[0-9./-]+$/u.test(term) ? normalizeCpfCnpj(term) || term : term;
  const searchClause: Prisma.ClientWhereInput = {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { company_name: { contains: term, mode: "insensitive" } },
      { fantasy_name: { contains: term, mode: "insensitive" } },
      { cpf_cnpj: { contains: documentTerm, mode: "insensitive" } },
    ],
  };
  return { AND: [base, searchClause] };
}
