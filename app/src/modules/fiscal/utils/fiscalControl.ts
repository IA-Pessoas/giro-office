import type { FiscalControlStatus } from "../services/fiscalControlService.ts";

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
