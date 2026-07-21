import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { parcelamentoTextFieldClassName } from "./parcelamentoFormControls";

interface ParcelamentoNativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  selectClassName?: string;
  wrapperClassName?: string;
}

export function ParcelamentoNativeSelect({
  children,
  selectClassName = "",
  wrapperClassName = "",
  ...props
}: ParcelamentoNativeSelectProps) {
  return (
    <span className={`relative block min-w-0 ${wrapperClassName}`}>
      <select
        {...props}
        className={`${parcelamentoTextFieldClassName} appearance-none pr-9 ${selectClassName}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
      />
    </span>
  );
}
