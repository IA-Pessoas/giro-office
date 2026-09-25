import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { FormField } from "@shared/components/FormField";
import { cn } from "@shared/ui/newLayout/utils";
import { FieldHelp } from "@shared/ui/newLayout/field-help";

export const regularizeTextFieldClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-500 dark:disabled:bg-gray-800";

export const regularizeTextareaClassName = `${regularizeTextFieldClassName} min-h-24 resize-y`;

export const regularizeSelectClassName = `${regularizeTextFieldClassName} appearance-none bg-[length:14px] bg-[position:right_0.95rem_center] bg-no-repeat pr-11`;

export const regularizeSecondaryButtonClassName =
  "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700";

export const regularizePrimaryButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export const regularizeClientStatusOptions = ["Ativo", "Inativo"] as const;

export const regularizeClientPfSexOptions = [
  { value: "F", label: "Feminino" },
  { value: "M", label: "Masculino" },
] as const;

export const regularizeClientPfMaritalStatusOptions = [
  "Solteiro",
  "Solteira",
  "Casado",
  "Casada",
  "Divorciado",
  "Divorciada",
  "Viúvo",
  "Viúva",
  "Separado",
  "Separada",
  "União estável",
] as const;

export const regularizeClientPfStateOptions = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const regularizeProcessStatusOptions = [
  "Pendente",
  "Andamento",
  "Protocolado",
  "Finalizado",
  "Paralisado",
] as const;

// Sugestões do campo "Tipo do processo"; o valor continua livre para tipos já gravados (#1347).
export const regularizeProcessTypeOptions = [
  "Abertura de empresa",
  "Alteração contratual",
  "Baixa de empresa",
  "Alvará de funcionamento",
  "Licença sanitária",
  "Licença ambiental",
  "Certificado do Corpo de Bombeiros",
  "Inscrição municipal",
  "Inscrição estadual",
  "Certidão negativa de débitos",
] as const;

export const regularizeFinancialStatusOptions = [
  "Pendente",
  "Regular",
  "Bônus",
  "Não Contratado",
] as const;

export const regularizeProcessStatusFilterOptions = [
  "Todos",
  ...regularizeProcessStatusOptions,
  "Aberto",
  "Em andamento",
  "Concluído",
  "Concluido",
  "Paralizado",
] as const;

export const regularizeGuidanceStatusOptions = [
  "Em andamento",
  "Pendente",
  "Concluído",
  "Cancelado",
] as const;

export const regularizeLicenseStatusOptions = [
  "Em Processo de Solicitação",
  "Em Andamento",
  "Finalizado",
  "Paralisado",
] as const;

export const regularizeLicenseStatusFilterOptions = [
  "Todos",
  ...regularizeLicenseStatusOptions,
  "Ativo",
  "Pendente",
  "Inativo",
  "Cancelado",
  "A vencer",
  "Vencido",
] as const;

export const regularizeUrgencyOptions = ["Baixa", "Média", "Alta", "Urgente"] as const;

export function getRegularizePresetOptions(
  options: readonly string[],
  currentValue?: string | null,
): string[] {
  const normalizedValue = currentValue?.trim();

  if (!normalizedValue || options.includes(normalizedValue)) {
    return [...options];
  }

  return [...options, normalizedValue];
}

export function getRegularizeLicenseDisplayStatus(
  status: string,
  dueDate?: string | null,
  referenceDate = new Date(),
): string {
  if (!dueDate) {
    return status;
  }

  const parsedDueDate = new Date(dueDate);
  if (Number.isNaN(parsedDueDate.getTime())) {
    return status;
  }

  const dueDay = Date.UTC(
    parsedDueDate.getUTCFullYear(),
    parsedDueDate.getUTCMonth(),
    parsedDueDate.getUTCDate(),
  );
  const today = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const nextMonth = new Date(today);
  const originalDay = nextMonth.getUTCDate();
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  nextMonth.setUTCDate(Math.min(originalDay, lastDay));

  if (dueDay < today.getTime()) {
    return "Vencido";
  }

  if (dueDay <= nextMonth.getTime()) {
    return "A vencer";
  }

  return status;
}

export type RegularizeFormOption = {
  id: string;
  label: string;
  description?: string | null;
};

export function RegularizeFormField({
  children,
  className,
  error,
  help,
  label,
  required,
}: {
  children: ReactNode;
  className?: string;
  error?: string;
  help?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <FormField
      className={cn("text-sm text-gray-700 dark:text-gray-300", className)}
      label={label}
      required={required}
      error={error}
      help={help ? <FieldHelp label={label} description={help} /> : null}
    >
      {children}
    </FormField>
  );
}

export function RegularizeFormError({
  message,
  sticky = true,
  title = "Revise os campos obrigatórios",
}: {
  message?: string | null;
  sticky?: boolean;
  title?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        sticky ? "sticky top-0 z-20" : "relative",
        "flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg shadow-red-950/5 dark:border-red-800/80 dark:bg-red-950/80 dark:text-red-100",
      )}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-900/70 dark:text-red-100">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block">{message}</span>
      </span>
    </div>
  );
}

export function RegularizeFormActions({
  cancelLabel = "Cancelar",
  isSubmitting,
  onCancel,
  submitLabel,
  submittingLabel = "Salvando...",
}: {
  cancelLabel?: string;
  isSubmitting: boolean;
  onCancel: () => void;
  submitLabel: string;
  submittingLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSubmitting}
        className={regularizeSecondaryButtonClassName}
      >
        {cancelLabel}
      </button>
      <button type="submit" disabled={isSubmitting} className={regularizePrimaryButtonClassName}>
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}
