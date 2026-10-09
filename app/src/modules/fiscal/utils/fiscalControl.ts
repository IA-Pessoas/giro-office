import type {
  FiscalControlStatus,
  FiscalMonthlyObligation,
} from "../services/fiscalControlService.ts";

export const FISCAL_CONTROL_STATUS_LABELS: Record<FiscalControlStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  AWAITING_CLIENT: "Aguardando cliente",
  COMPLETED: "Concluído",
};

/**
 * Como a UI trata a troca de situação: sair de Concluído é reabertura, que exige
 * Fiscal nível 3 e motivo (o serviço valida de novo).
 */
export function fiscalControlStatusChange(
  current: FiscalControlStatus,
  next: FiscalControlStatus,
  canReopen: boolean,
): "none" | "direct" | "reason" | "forbidden" {
  if (current === next) return "none";
  if (current !== "COMPLETED") return "direct";
  return canReopen ? "reason" : "forbidden";
}

/** Ações de uma obrigação conforme a situação; nenhuma com o controle concluído. */
export function fiscalObligationActions(
  status: FiscalMonthlyObligation["status"],
  editable: boolean,
): Array<"complete" | "dispense" | "undo" | "restore"> {
  if (!editable) return [];
  if (status === "PENDING") return ["complete", "dispense"];
  if (status === "COMPLETED") return ["undo"];
  return ["restore"];
}

/** Data local de hoje no formato do input date (AAAA-MM-DD). */
export function todayInputDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
