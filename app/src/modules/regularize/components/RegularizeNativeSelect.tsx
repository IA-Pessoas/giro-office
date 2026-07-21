import type { SelectHTMLAttributes } from "react";

import { cn } from "@shared/ui/newLayout/utils";

import { regularizeSelectClassName } from "./regularizeFormControls";

const regularizeSelectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%239ca3af' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

export type RegularizeNativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "style">;

export function RegularizeNativeSelect({ className, ...props }: RegularizeNativeSelectProps) {
  return (
    <select
      {...props}
      className={cn(regularizeSelectClassName, className)}
      style={regularizeSelectArrowStyle}
    />
  );
}
