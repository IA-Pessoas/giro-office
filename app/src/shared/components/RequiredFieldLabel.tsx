import type { ReactNode } from "react";

import { cn } from "@shared/ui/newLayout/utils";

type RequiredFieldLabelProps = {
  children: ReactNode;
  className?: string;
  required?: boolean;
};

export function RequiredFieldLabel({
  children,
  className,
  required = false,
}: RequiredFieldLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children}
      {required ? (
        <>
          <span aria-hidden="true" className="text-red-500">
            *
          </span>
          <span className="sr-only">campo obrigatório</span>
        </>
      ) : null}
    </span>
  );
}
