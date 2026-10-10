import { formatBrlAmount } from "../../../shared/utils/inputFormatting.ts";

import type { PessoalPayroll } from "../types/payroll";
import type { PessoalSituation } from "../types/tracking";

const EMPTY = "Não informado";
const yesNo = (value: boolean) => (value ? "Sim" : "Não");

/** "Sim" seguido do tipo e do valor quando existem, como na ficha antiga. */
function yesWithDetail(active: boolean, type: string | null, amount: number | null): string {
  if (!active) return "Não";
  return ["Sim", type?.trim(), amount === null ? null : formatBrlAmount(amount)]
    .filter(Boolean)
    .join(" - ");
}

/**
 * Linhas "Campo / Status" da ficha de folha, na ordem de `pessoal/pages/clientes/folha.php`.
 * Campo vazio sai como "Não informado", para a impressão não ficar com célula em branco.
 */
export function buildPayrollSheetRows(
  payroll: PessoalPayroll,
  unions: { id: string; name: string }[],
): [label: string, value: string][] {
  return [
    ["Grupo", payroll.group?.name || EMPTY],
    ["Adiantamento", yesWithDetail(payroll.advance, payroll.advance_type, payroll.advance_amount)],
    ["Prévia", yesNo(payroll.previous)],
    ["Onvio", yesNo(payroll.onvio)],
    ["Vale transporte", yesWithDetail(payroll.vt, payroll.vt_type, payroll.vt_value)],
    ["Vale alimentação", yesNo(payroll.va)],
    ["Taxa assistencial", yesNo(payroll.assistance_fee)],
    ["Bem Mais", yesNo(payroll.bem_mais)],
    ["BSF", yesNo(payroll.bsf)],
    ["Quantidade de funcionários", String(payroll.employees)],
    ["REINF", yesNo(payroll.reinf)],
    ["Sindicato", unions.find((union) => union.id === payroll.union_id)?.name || EMPTY],
    ["Contato", payroll.contact?.trim() || EMPTY],
  ];
}

/** Situações na ordem de cadastro, como na ficha antiga. */
export function sortSituationsForSheet<T extends Pick<PessoalSituation, "registration_date">>(
  situations: T[],
): T[] {
  return [...situations].sort((a, b) => a.registration_date.localeCompare(b.registration_date));
}
