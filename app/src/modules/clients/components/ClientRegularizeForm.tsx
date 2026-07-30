import type { ChangeEvent } from "react";

import {
  formatBrazilianPhoneInput,
  formatCpfCnpjInput,
  formatCpfInput,
} from "@shared/utils/inputFormatting";

import { forwardFormattedInputChange } from "./formattedInputChange";
import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName } from "../form/clientFormControls";
import type { ClientRegularizeFormValues } from "../types";
import {
  REGULARIZE_REGIME_OPTIONS,
  REGULARIZE_SEGMENT_OPTIONS,
  REGULARIZE_SIZE_OPTIONS,
} from "../utils/regularizeForm";

interface ClientRegularizeFormProps {
  values: ClientRegularizeFormValues;
  disabled?: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const labelClassName = "block text-sm font-medium text-slate-700 dark:text-white";
const sectionClassName =
  "rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-950/40";

function TextField({
  label,
  name,
  value,
  onChange,
  disabled,
  type = "text",
  placeholder,
}: {
  label: string;
  name: keyof ClientRegularizeFormValues;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className={labelClassName}>{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={clientTextFieldClassName}
      />
    </label>
  );
}

function ToggleField({
  label,
  name,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  name: keyof ClientRegularizeFormValues;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300 text-[var(--colors-brand-gradient-end)] focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-600 dark:bg-slate-900"
      />
      <span className="text-sm font-medium text-slate-700 dark:text-white">{label}</span>
    </label>
  );
}

export function ClientRegularizeForm({
  values,
  disabled = false,
  submitDisabled = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientRegularizeFormProps) {
  const handleCpfCnpjChange = (event: ChangeEvent<HTMLInputElement>) => {
    forwardFormattedInputChange(event, formatCpfCnpjInput, onChange);
  };
  const handleCpfChange = (event: ChangeEvent<HTMLInputElement>) => {
    forwardFormattedInputChange(event, formatCpfInput, onChange);
  };
  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    forwardFormattedInputChange(event, formatBrazilianPhoneInput, onChange);
  };

  return (
    <div className="space-y-6">
      <section className={sectionClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Identificação</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextField label="Código Domínio" name="dominio_code" value={values.dominio_code} onChange={onChange} disabled={disabled} />
          <TextField label="Nome / Apelido" name="name" value={values.name} onChange={onChange} disabled={disabled} />
          <TextField label="Razão Social" name="company_name" value={values.company_name} onChange={onChange} disabled={disabled} />
          <TextField label="Nome Fantasia" name="fantasy_name" value={values.fantasy_name} onChange={onChange} disabled={disabled} />
          <TextField label="CPF/CNPJ" name="cpf_cnpj" value={values.cpf_cnpj} onChange={handleCpfCnpjChange} disabled={disabled} />
          <TextField label="CNAE Principal" name="cnae" value={values.cnae} onChange={onChange} disabled={disabled} />
          <TextField label="CNAE Secundário" name="cnae_secondary" value={values.cnae_secondary} onChange={onChange} disabled={disabled} />
          <TextField label="Data de Abertura" name="opening_date" value={values.opening_date} onChange={onChange} disabled={disabled} type="date" />
          <TextField label="Cliente Desde" name="customer_since" value={values.customer_since} onChange={onChange} disabled={disabled} type="date" />
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Contato e Endereço</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextField label="Responsável" name="responsible" value={values.responsible} onChange={onChange} disabled={disabled} />
          <TextField label="CPF do Responsável" name="cpf_responsible" value={values.cpf_responsible} onChange={handleCpfChange} disabled={disabled} />
          <TextField label="Telefone" name="number" value={values.number} onChange={handlePhoneChange} disabled={disabled} />
          <TextField label="E-mail" name="email" value={values.email} onChange={onChange} disabled={disabled} type="email" />
          <div className="md:col-span-2 xl:col-span-2">
            <TextField label="Endereço" name="address" value={values.address} onChange={onChange} disabled={disabled} />
          </div>
          <TextField label="CEP" name="cep" value={values.cep} onChange={onChange} disabled={disabled} />
          <TextField label="Bairro" name="neighborhood" value={values.neighborhood} onChange={onChange} disabled={disabled} />
          <TextField label="Estado" name="state" value={values.state} onChange={onChange} disabled={disabled} placeholder="Ex: BA" />
          <TextField label="Cidade" name="city" value={values.city} onChange={onChange} disabled={disabled} />
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fiscal e Registro</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TextField label="Inscrição Municipal" name="municipal_registration" value={values.municipal_registration} onChange={onChange} disabled={disabled} />
          <TextField label="Inscrição Estadual" name="state_registration" value={values.state_registration} onChange={onChange} disabled={disabled} />
          <TextField label="Registro Junta Comercial" name="commercial_board_registration" value={values.commercial_board_registration} onChange={onChange} disabled={disabled} />

          <label className="space-y-1.5">
            <span className={labelClassName}>Regime</span>
            <ClientNativeSelect name="regime" value={values.regime} onChange={onChange} disabled={disabled}>
              <option value="">Selecione um regime</option>
              {REGULARIZE_REGIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ClientNativeSelect>
          </label>

          <label className="space-y-1.5">
            <span className={labelClassName}>Porte</span>
            <ClientNativeSelect name="size" value={values.size} onChange={onChange} disabled={disabled}>
              <option value="">Selecione um porte</option>
              {REGULARIZE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ClientNativeSelect>
          </label>

          <label className="space-y-1.5">
            <span className={labelClassName}>Segmento</span>
            <ClientNativeSelect name="segment" value={values.segment} onChange={onChange} disabled={disabled}>
              <option value="">Selecione um segmento</option>
              {REGULARIZE_SEGMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ClientNativeSelect>
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Serviços</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <ToggleField label="Contábil" name="contabil" checked={values.contabil} onChange={onChange} disabled={disabled} />
          <ToggleField label="Fiscal" name="fiscal" checked={values.fiscal} onChange={onChange} disabled={disabled} />
          <ToggleField label="Pessoal" name="pessoal" checked={values.pessoal} onChange={onChange} disabled={disabled} />
          <ToggleField label="Infoproduto" name="infoproduto" checked={values.infoproduto} onChange={onChange} disabled={disabled} />
          <ToggleField label="Consultoria" name="consultoria" checked={values.consultoria} onChange={onChange} disabled={disabled} />
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Datas Operacionais</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField label="Início da Paralisação" name="start_strike" value={values.start_strike} onChange={onChange} disabled={disabled} type="date" />
          <TextField label="Fim da Paralisação" name="end_strike" value={values.end_strike} onChange={onChange} disabled={disabled} type="date" />
          <TextField label="Data de Exclusão" name="deletion_date" value={values.deletion_date} onChange={onChange} disabled={disabled} type="date" />
        </div>
      </section>

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
