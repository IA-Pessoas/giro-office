import type { ChangeEvent } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName } from "../form/clientFormControls";
import type { ClientFormValues } from "../types";

interface ClientFormProps {
  values: ClientFormValues;
  disabled?: boolean;
  submitLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ClientForm({
  values,
  disabled = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">Nome</span>
          <input name="name" value={values.name} onChange={onChange} disabled={disabled} className={clientTextFieldClassName} />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">CPF/CNPJ</span>
          <input
            name="cpf_cnpj"
            value={values.cpf_cnpj}
            onChange={onChange}
            disabled={disabled}
            placeholder="Somente números"
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">Razão social</span>
          <input
            name="company_name"
            value={values.company_name}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">Nome fantasia</span>
          <input
            name="fantasy_name"
            value={values.fantasy_name}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">Status</span>
          <ClientNativeSelect name="status" value={values.status} onChange={onChange} disabled={disabled}>
            <option value="Ativo">Ativo</option>
            <option value="Prospect">Prospect</option>
            <option value="Inativo">Inativo</option>
            <option value="Fechado">Fechado</option>
          </ClientNativeSelect>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40">
          <input
            type="checkbox"
            name="service_unique"
            checked={values.service_unique}
            onChange={onChange}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-[var(--colors-brand-gradient-end)] focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-600 dark:bg-slate-900"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-white">Serviço único</span>
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
