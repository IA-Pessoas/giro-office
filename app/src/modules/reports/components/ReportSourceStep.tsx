import { Database } from "lucide-react";

import type { ReportsCatalogSource } from "../types/report.types";
import { ReportSelect, ReportStep } from "./ReportStep";

export function ReportSourceStep({
  sources,
  sourceKey,
  onSourceChange,
}: {
  sources: ReportsCatalogSource[];
  sourceKey: string;
  onSourceChange: (sourceKey: string) => void;
}) {
  return (
    <ReportStep
      title="1. Fonte de dados"
      description="Escolha uma fonte publicada para iniciar o relatório. A fonte define o que pode ser consultado."
    >
      <div className="max-w-xl space-y-3">
        <label className="block text-sm font-medium text-gray-800 dark:text-slate-200" htmlFor="report-source">
          Fonte
        </label>
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <ReportSelect
            id="report-source"
            value={sourceKey}
            onChange={(event) => onSourceChange(event.currentTarget.value)}
            aria-describedby="report-source-help"
          >
            <option value="">Selecione uma fonte</option>
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.label} · {source.module}
              </option>
            ))}
          </ReportSelect>
        </div>
        <p id="report-source-help" className="text-xs text-gray-500 dark:text-slate-500">
          Somente fontes autorizadas pelo catálogo aparecem nesta lista.
        </p>
      </div>
    </ReportStep>
  );
}
