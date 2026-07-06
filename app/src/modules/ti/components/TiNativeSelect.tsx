import type { SelectHTMLAttributes } from "react";

import { cn } from "@shared/ui/newLayout/utils";

import { tiInputClassName, tiLabelClassName } from "./tiWorkspaceUi";

type TiNativeSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export interface TiNativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  options?: readonly TiNativeSelectOption[];
}

export function TiNativeSelect({
  label,
  helperText,
  options,
  className,
  children,
  ...props
}: TiNativeSelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {label ? <span className={tiLabelClassName}>{label}</span> : null}
      <select className={cn(tiInputClassName, className)} {...props}>
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      {helperText ? (
        <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helperText}</span>
      ) : null}
    </label>
  );
}
