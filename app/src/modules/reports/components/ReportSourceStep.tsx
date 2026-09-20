import type { ReportsCatalogSource } from "../types/report.types";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { ReportStep } from "./ReportStep";
import { reportCheckboxClassName } from "./reportUi";

export function ReportSourceStep({
  sources,
  sourceKeys,
  onSourceChange,
  disabled,
}: {
  sources: ReportsCatalogSource[];
  sourceKeys: string[];
  onSourceChange: (sourceKey: string) => void;
  disabled?: boolean;
}) {
  const departments = new Map<string, ReportsCatalogSource[]>();
  for (const source of sources) {
    const department = source.department_label || "Outras áreas";
    const areas = departments.get(department) ?? [];
    areas.push(source);
    departments.set(department, areas);
  }
  return (
    <ReportStep
      title="Escolher áreas"
      description="Escolha uma ou mais áreas para o relatório. Cada uma terá seu próprio bloco de informações."
    >
      {[...departments].map(([department, areas]) => (
        <fieldset key={department} disabled={disabled} className="space-y-3">
          <legend className="mb-3 font-semibold text-gray-900 dark:text-white">{department}</legend>
          <div className="grid gap-3 md:grid-cols-2">
            {areas.map((source) => {
              const selected = sourceKeys.includes(source.key);
              return (
                <label
                  key={source.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${selected ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={source.label}
                    checked={selected}
                    onChange={() => onSourceChange(source.key)}
                    className={`mt-1 shrink-0 ${reportCheckboxClassName}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-900 dark:text-white">
                      {source.label}
                    </span>
                    {source.description ? (
                      <span className="mt-1 block text-sm text-gray-600 dark:text-slate-300">
                        {source.description}
                      </span>
                    ) : null}
                    <span className="mt-3 block text-xs text-gray-600 dark:text-slate-400">
                      {getSelectableReportFields(source).length} campos disponíveis
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </ReportStep>
  );
}
