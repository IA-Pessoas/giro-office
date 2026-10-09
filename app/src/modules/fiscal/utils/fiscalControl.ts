import { formatFiscalDateLabel } from "./fiscalDate.ts";
import type {
  FiscalControlStatus,
  FiscalMonthlyControl,
  FiscalMonthlyObligation,
  FiscalTransferResult,
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

/** userId: "" = todos; "none" = sem responsável; senão, o id do usuário. */
export type FiscalResponsibleFilter = { userId: string; basis: "competence" | "current" };

/**
 * Carteira por competência (responsável registrado no controle) ou carteira atual
 * (responsável padrão vigente do cliente).
 */
export function matchesResponsible(
  item: Pick<FiscalMonthlyControl, "responsible_id" | "default_responsible_id">,
  filter: FiscalResponsibleFilter,
): boolean {
  if (!filter.userId) return true;
  const value = filter.basis === "current" ? item.default_responsible_id : item.responsible_id;
  return filter.userId === "none" ? value === null : value === filter.userId;
}

/** Resumo do lote: quantos foram transferidos e por que os outros ficaram de fora. */
export function formatTransferResult(result: FiscalTransferResult): string {
  const moved = result.transferred.length;
  const parts = [moved === 1 ? "1 transferido" : `${moved} transferidos`];
  if (result.skipped.length) {
    const reasons = [...new Set(result.skipped.map((item) => item.reason))].join(" ");
    const count = result.skipped.length;
    parts.push(`${count === 1 ? "1 ignorado" : `${count} ignorados`} (${reasons})`);
  }
  return `${parts.join(", ")}.`;
}

/** Célula da carteira anual: "—" quando a declaração não está no controle. */
export function formatAnnualDeclaration(
  declaration: { status: FiscalMonthlyObligation["status"]; completed_on: string | null } | undefined,
): string {
  if (!declaration) return "—";
  if (declaration.status === "NOT_APPLICABLE") return "Não aplicável";
  if (declaration.status === "PENDING") return "Pendente";
  return `Cumprida em ${formatFiscalDateLabel(declaration.completed_on)}`;
}
