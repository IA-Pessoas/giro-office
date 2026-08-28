import type { ReportBuilderState, ReportsCatalogSource } from "../types/report.types";
import { isReportFieldSelectable } from "../utils/reportBuilder";
import { ReportStep, reportMutedClassName } from "./ReportStep";

export function ReportFieldsStep({
  source,
  fieldKeys,
  onFieldKeysChange,
}: {
  source: ReportsCatalogSource;
  fieldKeys: ReportBuilderState["fieldKeys"];
  onFieldKeysChange: (fieldKeys: string[]) => void;
}) {
  function toggleField(fieldKey: string, checked: boolean) {
    onFieldKeysChange(checked ? [...new Set([...fieldKeys, fieldKey])] : fieldKeys.filter((key) => key !== fieldKey));
  }

  return (
    <ReportStep
      title="3. Campos"
      description="Selecione os campos que serão exibidos. Campos protegidos ou não publicados permanecem indisponíveis."
    >
      {source.fields.length === 0 ? (
        <p className={reportMutedClassName} role="status">Esta fonte não publicou campos para seleção.</p>
      ) : (
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Campos do relatório</legend>
          {source.fields.map((field) => {
            const selectable = isReportFieldSelectable(field);
            return (
              <label
                key={field.key}
                className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                  selectable
                    ? "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                    : "border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500"
                }`}
                title={selectable ? undefined : "Este campo não foi publicado para seleção."}
              >
                <input
                  type="checkbox"
                  checked={fieldKeys.includes(field.key)}
                  disabled={!selectable}
                  onChange={(event) => toggleField(field.key, event.currentTarget.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-gray-900 dark:text-slate-100">{field.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-slate-500">
                    {selectable ? field.key : "Não selecionável por regra de negócio"}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
    </ReportStep>
  );
}
