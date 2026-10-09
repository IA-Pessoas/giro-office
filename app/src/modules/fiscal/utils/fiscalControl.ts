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
 * Como a UI trata a troca de situação (o serviço valida de novo). Exigem Fiscal nível 3
 * e motivo: sair de Concluído (reabertura) e concluir com documento pendente ou sem
 * registro na Triagem (`triagePending` diferente de 0).
 */
export function fiscalControlStatusChange(
  current: FiscalControlStatus,
  next: FiscalControlStatus,
  canAuthorize: boolean,
  triagePending: number | null = 0,
): "none" | "direct" | "reason" | "forbidden" {
  if (current === next) return "none";
  const needsAuthorization =
    current === "COMPLETED" || (next === "COMPLETED" && triagePending !== 0);
  if (!needsAuthorization) return "direct";
  return canAuthorize ? "reason" : "forbidden";
}

/** Resumo da Triagem para a carteira. */
export function formatTriagePending(pending: number | null): string {
  if (pending === null) return "Sem registro";
  if (pending === 0) return "Em dia";
  return pending === 1 ? "1 pendente" : `${pending} pendentes`;
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
