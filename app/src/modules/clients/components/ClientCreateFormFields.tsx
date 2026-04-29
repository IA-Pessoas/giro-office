import type { ChangeEvent } from "react";

import type { ClientCreateFormState, IbgeCity, IbgeState } from "./clientCreateFormState";

const inputClass =
  "w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900";
const selectClass =
  "w-full appearance-none rounded-xl border-2 border-gray-200 bg-white bg-[length:14px] bg-[position:right_1.25rem_center] bg-no-repeat px-4 py-2.5 pr-14 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:focus:ring-blue-900";
const selectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

const labelClass = "block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5";

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
        <select className={selectClass} style={selectArrowStyle} name="type" value={formData.type} onChange={onChange}>
          <option value="PJ">Pessoa Jurídica (PJ)</option>
          <option value="PF">Pessoa Física (PF)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Tipo de Registro</span>
        <select
          className={selectClass}
          style={selectArrowStyle}
          name="type_registration"
          value={formData.type_registration}
          onChange={onChange}
        >
          <option value="Existente">Existente</option>
          <option value="Novo">Novo</option>
          <option value="Constituição de Empresa">Constituição de Empresa</option>
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{formData.type === "PJ" ? "CNPJ" : "CPF"}</span>
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            name="cpf_cnpj"
            value={formData.cpf_cnpj}
            onChange={onChange}
            placeholder="Apenas números"
          />
          {formData.type === "PJ" ? (
            <button
              type="button"
              className="shrink-0 inline-flex items-center justify-center px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
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
        <input className={inputClass} name="name" value={formData.name} onChange={onChange} />
      </label>

      {formData.type === "PJ" ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Razão Social</span>
            <input
              className={inputClass}
              name="company_name"
              value={formData.company_name}
              onChange={onChange}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Nome Fantasia</span>
            <input
              className={inputClass}
              name="fantasy_name"
              value={formData.fantasy_name}
              onChange={onChange}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Data de Abertura</span>
            <input
              className={inputClass}
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
        <input className={inputClass} name="cep" value={formData.cep} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Endereço Completo</span>
        <input className={inputClass} name="address" value={formData.address} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Bairro</span>
        <input
          className={inputClass}
          name="neighborhood"
          value={formData.neighborhood}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Estado</span>
        <select className={selectClass} style={selectArrowStyle} name="state" value={formData.state} onChange={onChange}>
          <option value="">Selecione o estado</option>
          {states.map((s) => (
            <option key={s.id} value={s.sigla}>
              {s.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Cidade</span>
        <select
          className={selectClass}
          style={selectArrowStyle}
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
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Telefone</span>
        <input className={inputClass} name="number" value={formData.number} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-2">
        <span className={labelClass}>E-mail</span>
        <input
          className={inputClass}
          type="email"
          name="email"
          value={formData.email}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Responsável Legal</span>
        <input
          className={inputClass}
          name="responsible"
          value={formData.responsible}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CPF Responsável</span>
        <input
          className={inputClass}
          name="cpf_responsible"
          value={formData.cpf_responsible}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Preposto</span>
        <input className={inputClass} name="agent" value={formData.agent} onChange={onChange} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>CPF Preposto</span>
        <input
          className={inputClass}
          name="cpf_agent"
          value={formData.cpf_agent}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Instagram</span>
        <input
          className={inputClass}
          name="instagram"
          value={formData.instagram}
          onChange={onChange}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Indicação</span>
        <input
          className={inputClass}
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
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-600"
        />
        <span className={`${labelClass} mb-0`}>Serviço Único?</span>
      </label>
    </div>
  );
}
