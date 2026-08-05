import type { ChangeEvent } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName, clientTextareaClassName } from "../form/clientFormControls";
import type { ClientCommercialFormValues } from "../types";
import { COMMERCIAL_STATUS_OPTIONS } from "../utils/commercialForm";

interface ClientCommercialFormProps {
  values: ClientCommercialFormValues;
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

export function ClientCommercialForm({
  values,
  disabled = false,
  submitDisabled = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientCommercialFormProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        Alterar o status de prospecção pode impactar o status geral do cliente.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClassName}>Status da Prospecção</span>
          <ClientNativeSelect
            name="prospecting_status"
            value={values.prospecting_status}
            onChange={onChange}
            disabled={disabled}
          >
            <option value="">Selecione um status</option>
            {COMMERCIAL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ClientNativeSelect>
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Data do Status</span>
          <input
            type="date"
            name="date_status"
            value={values.date_status}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Data de Registro da Prospecção</span>
          <input
            type="date"
            name="register_date_prospecting"
            value={values.register_date_prospecting}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5 md:col-span-2">
          <span className={labelClassName}>Descrição da Prospecção</span>
          <textarea
            name="description_prospecting"
            value={values.description_prospecting}
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
          className="rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
