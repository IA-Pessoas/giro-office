import type { ChangeEvent } from "react";

import { clientTextFieldClassName } from "./clientFormControls";

export interface ClientAddressFieldValues {
  address: string;
  cep: string;
  neighborhood: string;
  state: string;
  city: string;
}

interface ClientAddressFieldsProps {
  values: ClientAddressFieldValues;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  addressFieldClassName?: string;
}

const labelClassName = "block text-sm font-medium text-slate-700 dark:text-white";

export function ClientAddressFields({
  values,
  disabled = false,
  onChange,
  addressFieldClassName = "space-y-1.5",
}: ClientAddressFieldsProps) {
  return (
    <>
      <label className={addressFieldClassName}>
        <span className={labelClassName}>Endereço</span>
        <input
          name="address"
          value={values.address}
          onChange={onChange}
          disabled={disabled}
          className={clientTextFieldClassName}
        />
      </label>
      <label className="space-y-1.5">
        <span className={labelClassName}>CEP</span>
        <input
          name="cep"
          value={values.cep}
          onChange={onChange}
          disabled={disabled}
          className={clientTextFieldClassName}
        />
      </label>
      <label className="space-y-1.5">
        <span className={labelClassName}>Bairro</span>
        <input
          name="neighborhood"
          value={values.neighborhood}
          onChange={onChange}
          disabled={disabled}
          className={clientTextFieldClassName}
        />
      </label>
      <label className="space-y-1.5">
        <span className={labelClassName}>Estado</span>
        <input
          name="state"
          value={values.state}
          onChange={onChange}
          disabled={disabled}
          className={clientTextFieldClassName}
        />
      </label>
      <label className="space-y-1.5">
        <span className={labelClassName}>Cidade</span>
        <input
          name="city"
          value={values.city}
          onChange={onChange}
          disabled={disabled}
          className={clientTextFieldClassName}
        />
      </label>
    </>
  );
}
