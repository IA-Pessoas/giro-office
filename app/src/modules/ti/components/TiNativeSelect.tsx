import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@shared/ui/newLayout/utils";

import { tiInputClassName, tiLabelClassName } from "./tiWorkspaceUi";

type TiNativeSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export interface TiNativeSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "style"> {
  label?: ReactNode;
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
      <span className="relative block min-w-0">
        <select className={cn(tiInputClassName, "appearance-none pr-10", className)} {...props}>
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400"
        />
      </span>
      {helperText ? (
        <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{helperText}</span>
      ) : null}
    </label>
  );
}
