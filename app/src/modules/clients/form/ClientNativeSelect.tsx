import clsx from "clsx";
import type { SelectHTMLAttributes } from "react";

const nativeSelectClassName =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px] bg-[position:right_1.25rem_center] bg-no-repeat px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const nativeSelectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

export type ClientNativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "style">;

/** Select nativo estilizado do módulo clients; seta e aparência ficam encapsuladas aqui (sem `style` nas telas). */
export function ClientNativeSelect({ className, ...props }: ClientNativeSelectProps) {
  return (
    <select
      {...props}
      className={clsx(nativeSelectClassName, className)}
      style={nativeSelectArrowStyle}
    />
  );
}
