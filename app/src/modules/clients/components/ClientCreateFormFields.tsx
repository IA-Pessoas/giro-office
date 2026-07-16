import type { ChangeEvent } from "react";

import { ClientNativeSelect } from "../form/ClientNativeSelect";
import { clientTextFieldClassName } from "../form/clientFormControls";
import type { ClientCreateFormState, IbgeCity, IbgeState } from "./clientCreateFormState";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-white";

interface ClientCreateFormFieldsProps {
  formData: ClientCreateFormState;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  states: IbgeState[];
  cities: IbgeCity[];
  isSearchingCnpj: boolean;
  onSearchCnpj: () => void;
}

export function ClientCreateFormFields({
  formData,
  onChange,
  states,
  cities,
  isSearchingCnpj,
  onSearchCnpj,
}: ClientCreateFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Tipo de Pessoa</span>
        <ClientNativeSelect name="type" value={formData.type} onChange={onChange}>
          <option value="PJ">Pessoa Jurídica (PJ)</option>
          <option value="PF">Pessoa Física (PF)</option>
        </ClientNativeSelect>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Tipo de Registro</span>
        <ClientNativeSelect
          name="type_registration"
          value={formData.type_registration}
          onChange={onChange}
        >
          <option value="Existente">Existente</option>
          <option value="Novo">Novo</option>
          <option value="Constituição de Empresa">Constituição de Empresa</option>
        </ClientNativeSelect>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{formData.type === "PJ" ? "CNPJ" : "CPF"}</span>
        <div className="flex gap-2">
          <input
            className={`${clientTextFieldClassName} flex-1`}
            name="cpf_cnpj"
            value={formData.cpf_cnpj}
            onChange={onChange}
            placeholder="Apenas números"
          />
          {formData.type === "PJ" ? (
            <button
              type="button"
              className="shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onSearchCnpj}
              disabled={isSearchingCnpj}
              title="Buscar dados na Receita"
            >
              {isSearchingCnpj ? "…" : "Buscar"}
            </button>
          ) : null}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Nome / Apelido</span>
        <input className={clientTextFieldClassName} name="name" value={formData.name} onChange={onChange} />
      </label>

      {formData.type === "PJ" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Razão Social</span>
            <input
              className={clientTextFieldClassName}
              name="company_name"
              value={formData.company_name}
              onChange={onChange}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Nome Fantasia</span>
            <input
              className={clientTextFieldClassName}
              name="fantasy_name"
              value={formData.fantasy_name}
              onChange={onChange}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Data de Abertura</span>
            <input
              className={clientTextFieldClassName}
              type="date"
              name="opening_date"
              value={formData.opening_date}
              onChange={onChange}
            />
          </label>
        </>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CEP</span>
        <input className={clientTextFieldClassName} name="cep" value={formData.cep} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Endereço Completo</span>
        <input className={clientTextFieldClassName} name="address" value={formData.address} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Bairro</span>
        <input
          className={clientTextFieldClassName}
          name="neighborhood"
          value={formData.neighborhood}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Estado</span>
        <ClientNativeSelect name="state" value={formData.state} onChange={onChange}>
          <option value="">Selecione o estado</option>
          {states.map((s) => (
            <option key={s.id} value={s.sigla}>
              {s.nome}
            </option>
          ))}
        </ClientNativeSelect>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Cidade</span>
        <ClientNativeSelect
          name="city"
          value={formData.city}
          onChange={onChange}
          disabled={!formData.state}
        >
          <option value="">Selecione a cidade</option>
          {cities.map((c) => (
            <option key={c.id} value={c.nome}>
              {c.nome}
            </option>
          ))}
        </ClientNativeSelect>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Telefone</span>
        <input className={clientTextFieldClassName} name="number" value={formData.number} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-2">
        <span className={labelClass}>E-mail</span>
        <input
          className={clientTextFieldClassName}
          type="email"
          name="email"
          value={formData.email}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Responsável Legal</span>
        <input
          className={clientTextFieldClassName}
          name="responsible"
          value={formData.responsible}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CPF Responsável</span>
        <input
          className={clientTextFieldClassName}
          name="cpf_responsible"
          value={formData.cpf_responsible}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Preposto</span>
        <input className={clientTextFieldClassName} name="agent" value={formData.agent} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CPF Preposto</span>
        <input
          className={clientTextFieldClassName}
          name="cpf_agent"
          value={formData.cpf_agent}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Instagram</span>
        <input
          className={clientTextFieldClassName}
          name="instagram"
          value={formData.instagram}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Indicação</span>
        <input
          className={clientTextFieldClassName}
          name="indication"
          value={formData.indication}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-row items-center gap-2 md:col-span-2 xl:col-span-3">
        <input
          id="service_unique"
          name="service_unique"
          type="checkbox"
          checked={formData.service_unique}
          onChange={onChange}
          className="h-4 w-4 rounded border-slate-300 text-[var(--colors-brand-gradient-end)] focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-600 dark:bg-slate-900"
        />
        <span className={`${labelClass} mb-0`}>Serviço Único?</span>
      </label>
    </div>
  );
}
