import type { ChangeEvent } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName } from "../form/clientFormControls";
import type {
  CreateClientIntegrationFormValues,
  UpdateClientIntegrationFormValues,
} from "../types";

type IntegrationFormMode = "create" | "edit";

type IntegrationFormValues =
  | CreateClientIntegrationFormValues
  | UpdateClientIntegrationFormValues;

interface ClientIntegrationFormProps {
  mode: IntegrationFormMode;
  values: IntegrationFormValues;
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

function isCreateValues(
  values: IntegrationFormValues,
): values is CreateClientIntegrationFormValues {
  return "opening_date" in values;
}

export function ClientIntegrationForm({
  mode,
  values,
  disabled = false,
  submitDisabled = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ClientIntegrationFormProps) {
  const isCreate = mode === "create" && isCreateValues(values);
  const createValues = isCreate ? values : null;
  const editValues = !isCreate ? (values as UpdateClientIntegrationFormValues) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1.5">
          <span className={labelClassName}>Tipo de Pessoa</span>
          <ClientNativeSelect
            name="type"
            value={values.type}
            onChange={onChange}
            disabled={disabled}
          >
            <option value="PJ">Pessoa Jurídica (PJ)</option>
            <option value="PF">Pessoa Física (PF)</option>
          </ClientNativeSelect>
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Tipo de Registro</span>
          <ClientNativeSelect
            name="type_registration"
            value={values.type_registration}
            onChange={onChange}
            disabled={disabled}
          >
            <option value="Existente">Existente</option>
            <option value="Novo">Novo</option>
            <option value="Constituição de Empresa">Constituição de Empresa</option>
          </ClientNativeSelect>
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>{values.type === "PJ" ? "CNPJ" : "CPF"}</span>
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
          <span className={labelClassName}>Nome / Apelido</span>
          <input
            name="name"
            value={values.name}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Razão Social</span>
          <input
            name="company_name"
            value={values.company_name}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Nome Fantasia</span>
          <input
            name="fantasy_name"
            value={values.fantasy_name}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        {createValues ? (
          <label className="space-y-1.5">
            <span className={labelClassName}>Data de Abertura</span>
            <input
              type="date"
              name="opening_date"
              value={createValues.opening_date}
              onChange={onChange}
              disabled={disabled}
              className={clientTextFieldClassName}
            />
          </label>
        ) : null}

        <label className="space-y-1.5">
          <span className={labelClassName}>Telefone</span>
          <input
            name="number"
            value={values.number}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5 md:col-span-2 xl:col-span-2">
          <span className={labelClassName}>E-mail</span>
          <input
            type="email"
            name="email"
            value={values.email}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Responsável Legal</span>
          <input
            name="responsible"
            value={values.responsible}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>CPF Responsável</span>
          <input
            name="cpf_responsible"
            value={values.cpf_responsible}
            onChange={onChange}
            disabled={disabled}
            placeholder="Somente números"
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Preposto</span>
          <input
            name="agent"
            value={values.agent}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>CPF Preposto</span>
          <input
            name="cpf_agent"
            value={values.cpf_agent}
            onChange={onChange}
            disabled={disabled}
            placeholder="Somente números"
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Instagram</span>
          <input
            name="instagram"
            value={values.instagram}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        <label className="space-y-1.5">
          <span className={labelClassName}>Indicação</span>
          <input
            name="indication"
            value={values.indication}
            onChange={onChange}
            disabled={disabled}
            className={clientTextFieldClassName}
          />
        </label>

        {createValues ? (
          <>
            <label className="space-y-1.5">
              <span className={labelClassName}>Participantes da Reunião</span>
              <input
                name="participants_meet"
                value={createValues.participants_meet}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClassName}>Tipo de Reunião</span>
              <input
                name="meet_type"
                value={createValues.meet_type}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>
          </>
        ) : null}

        {editValues ? (
          <>
            <label className="space-y-1.5 md:col-span-2 xl:col-span-2">
              <span className={labelClassName}>Endereço</span>
              <input
                name="address"
                value={editValues.address}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClassName}>CEP</span>
              <input
                name="cep"
                value={editValues.cep}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClassName}>Bairro</span>
              <input
                name="neighborhood"
                value={editValues.neighborhood}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClassName}>Estado</span>
              <input
                name="state"
                value={editValues.state}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>

            <label className="space-y-1.5">
              <span className={labelClassName}>Cidade</span>
              <input
                name="city"
                value={editValues.city}
                onChange={onChange}
                disabled={disabled}
                className={clientTextFieldClassName}
              />
            </label>
          </>
        ) : null}

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 md:col-span-2 xl:col-span-3 dark:border-slate-700 dark:bg-slate-950/40">
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
