import { Button } from "@shared/ui/newLayout/button";
import type { ReportsCatalogSource } from "../types/report.types";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { reportCheckboxClassName } from "./reportUi";
import { formatCount } from "@shared/utils/formatters";

export function ReportFieldsStep({
  source,
  fieldKeys,
  onFieldKeysChange,
  disabled,
}: {
  source: ReportsCatalogSource;
  fieldKeys: string[];
  onFieldKeysChange: (fieldKeys: string[]) => void;
  disabled?: boolean;
}) {
  const fields = getSelectableReportFields(source);
  return (
    <fieldset
      disabled={disabled}
      className="space-y-4 border-t border-gray-200 pt-4 dark:border-slate-700"
    >
      <legend className="font-semibold text-gray-900 dark:text-white">
        Campos de {source.label}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onFieldKeysChange(fields.map((field) => field.key))}
        >
          Selecionar todos
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onFieldKeysChange([])}>
          Limpar todos
        </Button>
        <span className="text-xs text-gray-600 dark:text-slate-400">
          {fieldKeys.length} de {formatCount(fields.length, "campo", "campos")}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label
            key={field.key}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-900 dark:border-slate-700 dark:text-slate-100"
          >
            <input
              type="checkbox"
              checked={fieldKeys.includes(field.key)}
              onChange={(event) =>
                onFieldKeysChange(
                  event.currentTarget.checked
                    ? [...fieldKeys, field.key]
                    : fieldKeys.filter((key) => key !== field.key),
                )
              }
              className={reportCheckboxClassName}
            />
            {field.label}
          </label>
        ))}
      </div>
      {fieldKeys.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Escolha ao menos um campo nesta área para continuar.
        </p>
      ) : null}
    </fieldset>
  );
}
