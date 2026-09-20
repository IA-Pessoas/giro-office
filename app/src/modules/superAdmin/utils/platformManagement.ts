import type {
  PlatformAuditRecord,
  PlatformOrganizationPlan,
  PlatformOrganizationStatus,
} from "../types";

export const PLATFORM_STATUS_LABELS: Record<PlatformOrganizationStatus, string> = {
  trial: "Trial",
  past_due: "Em atraso",
  active: "Ativa",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

export const PLATFORM_PLAN_LABELS: Record<PlatformOrganizationPlan, string> = {
  trial: "Trial",
  pro: "Pro",
  enterprise: "Enterprise",
};

export function isPlatformConflict(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 409;
}

export function getPlatformErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

export function getPlatformMutationErrorMessage(error: unknown, fallback: string): string {
  if (isPlatformConflict(error)) {
    return "Esta organização foi alterada por outra pessoa. Os dados foram atualizados; revise e tente novamente.";
  }
  return getPlatformErrorMessage(error, fallback);
}

export function isBlockingOrganizationStatus(status: PlatformOrganizationStatus): boolean {
  return status === "past_due" || status === "suspended" || status === "cancelled";
}

export function formatCnpjInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function getLogoUrlError(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 2_048) return "A URL deve ter no máximo 2.048 caracteres.";

  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && !url.username && !url.password
      ? null
      : "Informe uma URL HTTPS sem credenciais.";
  } catch {
    return "Informe uma URL HTTPS válida.";
  }
}

function formatAuditValue(value: string | null, kind: "status" | "plan" | "logo"): string {
  if (value === null) return "não definida";
  if (kind === "status") {
    return PLATFORM_STATUS_LABELS[value as PlatformOrganizationStatus] ?? value;
  }
  if (kind === "plan") {
    return PLATFORM_PLAN_LABELS[value as PlatformOrganizationPlan] ?? value;
  }
  return value;
}

export function formatAuditChanges(changes: PlatformAuditRecord["changes"]): string[] {
  if (!changes) return [];

  const lines: string[] = [];
  if (changes.status) {
    lines.push(
      `Status: ${formatAuditValue(changes.status.from, "status")} → ${formatAuditValue(changes.status.to, "status")}`,
    );
  }
  if (changes.subscription_plan) {
    lines.push(
      `Plano: ${formatAuditValue(changes.subscription_plan.from, "plan")} → ${formatAuditValue(changes.subscription_plan.to, "plan")}`,
    );
  }
  if (changes.logo_url) {
    lines.push(
      `Logo: ${formatAuditValue(changes.logo_url.from, "logo")} → ${formatAuditValue(changes.logo_url.to, "logo")}`,
    );
  }
  if (changes.modules) {
    const moduleKeys = new Set([
      ...Object.keys(changes.modules.before),
      ...Object.keys(changes.modules.after),
    ]);
    const permissionLabels = ["Sem acesso", "Visualizador", "Usuário", "Administrador"];
    for (const moduleKey of [...moduleKeys].sort()) {
      const before = changes.modules.before[moduleKey];
      const after = changes.modules.after[moduleKey];
      lines.push(
        `Módulo ${moduleKey}: ${before === undefined ? "não definido" : permissionLabels[before]} → ${after === undefined ? "não definido" : permissionLabels[after]}`,
      );
    }
  }
  if (changes.ownership) {
    const { before, after, previousOwnerAction, justification } = changes.ownership;
    lines.push(`Ownership: ${before.ownerId} → ${after.ownerId}`);
    lines.push(
      `Owner anterior: ${previousOwnerAction === "deactivate" ? "desativado" : "rebaixado"}`,
    );
    lines.push(`Justificativa: ${justification}`);
  }
  return lines;
}
