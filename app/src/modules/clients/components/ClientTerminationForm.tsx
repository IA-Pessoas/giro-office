import type { ChangeEvent } from "react";

import { clientTextFieldClassName, clientTextareaClassName } from "../form/clientFormControls";
import type { ClientTerminationFormValues } from "../types";

interface ClientTerminationFormProps {
  values: ClientTerminationFormValues;
  disabled?: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const labelClassName = "block text-sm font-medium text-slate-700 dark:text-white";

export function ClientTerminationForm({
  values,
  disabled = false,
  submitDisabled = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientTerminationFormProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200">
        Esta ação inicia o processo de inativação do cliente e pode impactar tarefas abertas. Revise os dados antes de confirmar.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClassName}>Motivo</span>
          <input
            name="reason"
            value={values.reason}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Competência de Saída</span>
          <input
            type="month"
            name="competence_output"
            value={values.competence_output}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5 md:col-span-2">
          <span className={labelClassName}>Descrição</span>
          <textarea
            name="description"
            value={values.description}
            onChange={onChange}
            disabled={disabled}
            className={clientTextareaClassName}
          />
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || submitDisabled}
          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-950/20 transition-all hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
