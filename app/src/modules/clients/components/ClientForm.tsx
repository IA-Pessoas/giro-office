import type { ChangeEvent } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName } from "../form/clientFormControls";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import type { ClientFormValues } from "../types";
import { CLIENT_TAX_REGIME_OPTIONS } from "../utils/clientForm";
import { validateCpfCnpjDocument } from "../utils/documentValidation";

interface ClientFormProps {
  values: ClientFormValues;
  disabled?: boolean;
  showPersonType?: boolean;
  showDocumentError?: boolean;
  legacyTaxRegime?: string | null;
  submitLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ClientForm({
  values,
  disabled = false,
  showPersonType = false,
  showDocumentError = false,
  legacyTaxRegime = null,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  const documentLabel = showPersonType ? (values.type === "PF" ? "CPF" : "CNPJ") : "CPF/CNPJ";
  const documentError = showDocumentError && showPersonType && values.cpf_cnpj
    ? validateCpfCnpjDocument(values.cpf_cnpj, showPersonType ? values.type : undefined)
    : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {values.type === "PF" ? (
          <label className="space-y-1.5">
            <RequiredFieldLabel className="text-sm font-medium text-slate-700 dark:text-white" required>
              Nome
            </RequiredFieldLabel>
            <input
              name="name"
              value={values.name}
              onChange={onChange}
              disabled={disabled}
              className={clientTextFieldClassName}
              aria-required="true"
            />
          </label>
        ) : null}

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

        {showPersonType ? (
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">Tipo de pessoa</span>
            <ClientNativeSelect
              name="type"
              value={values.type ?? "PJ"}
              onChange={onChange}
              disabled={disabled}
            >
              <option value="PJ">Pessoa Jurídica (PJ)</option>
              <option value="PF">Pessoa Física (PF)</option>
            </ClientNativeSelect>
          </label>
        ) : null}

        <label className="space-y-1.5">
          <RequiredFieldLabel className="text-sm font-medium text-slate-700 dark:text-white" required>
            {documentLabel}
          </RequiredFieldLabel>
          <input
            name="cpf_cnpj"
            value={values.cpf_cnpj}
            onChange={onChange}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(documentError)}
            aria-describedby={documentError ? "client-create-document-error" : undefined}
            placeholder={
              showPersonType
                ? values.type === "PF"
                  ? "000.000.000-00"
                  : "00.000.000/0000-00"
                : "Somente números"
            }
            className={clientTextFieldClassName}
            aria-required="true"
          />
          {documentError ? (
            <span
              id="client-create-document-error"
              className="block text-xs font-medium text-red-600 dark:text-red-300"
            >
              {documentError}
            </span>
          ) : null}
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

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white">
            Regime tributário
          </span>
          <ClientNativeSelect name="regime" value={values.regime} onChange={onChange} disabled={disabled}>
            <option value="">Selecione um regime</option>
            {CLIENT_TAX_REGIME_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </ClientNativeSelect>
          {legacyTaxRegime && values.regime === "" ? (
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Regime atual: {legacyTaxRegime}
            </span>
          ) : null}
        </label>

        <label className="flex items-center gap-2 md:col-span-2">
          <input
            type="checkbox"
            name="service_unique"
            checked={values.service_unique}
            onChange={onChange}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-[var(--colors-brand-gradient-end)] focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-600 dark:bg-slate-900"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-white">Serviço único?</span>
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
