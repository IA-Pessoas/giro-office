import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";

import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { cn } from "@shared/ui/newLayout/utils";

type ControlProps = {
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  /** Botão de ajuda (FieldHelp). Fica fora do <label>: dentro dele, o botão roubava o rótulo do campo. */
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  labelClassName?: string;
};

/**
 * Campo de formulário acessível (#1367): rótulo ligado ao controle por `htmlFor`/`id`, ajuda
 * fora do rótulo e erro abaixo do campo, anunciado via `aria-describedby` e `aria-invalid`.
 *
 * O controle recebe o `id` quando é um elemento nativo (input, select, textarea) ou quando há
 * ajuda; nos demais casos o rótulo envolve o filho, que já nomeia qualquer input aninhado.
 */
export function FormField({
  label,
  children,
  help,
  error,
  required = false,
  className,
  labelClassName,
}: FormFieldProps) {
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const labelText = (
    <RequiredFieldLabel className={labelClassName} required={required}>
      {label}
    </RequiredFieldLabel>
  );
  const errorMessage = error ? (
    <span id={errorId} role="alert" className="text-xs text-red-700 dark:text-red-300">
      {error}
    </span>
  ) : null;

  if (isValidElement<ControlProps>(children) && (typeof children.type === "string" || help)) {
    const control = children as ReactElement<ControlProps>;
    const controlId = control.props.id ?? generatedId;
    const describedBy = [control.props["aria-describedby"], error ? errorId : null]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <span className="inline-flex items-center gap-1">
          <label htmlFor={controlId}>{labelText}</label>
          {help}
        </span>
        {cloneElement(control, {
          id: controlId,
          "aria-invalid": error ? true : control.props["aria-invalid"],
          "aria-describedby": describedBy || undefined,
        })}
        {errorMessage}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label className="flex flex-col gap-2">
        {labelText}
        {children}
      </label>
      {errorMessage}
    </div>
  );
}
