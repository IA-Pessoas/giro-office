import { Plus, Trash2 } from "lucide-react";

import type { ReportBuilderState, ReportsCatalogField, ReportsCatalogSource } from "../types/report.types";
import { getReportFieldOperators, isReportFieldSelectable } from "../utils/reportBuilder";
import { Button } from "@shared/ui/newLayout/button";
import { Input } from "@shared/ui/newLayout/input";
import { ReportSelect, ReportStep, reportMutedClassName } from "./ReportStep";

export function ReportFiltersStep({
  source,
  filters,
  filterLogic,
  onFiltersChange,
  onFilterLogicChange,
}: {
  source: ReportsCatalogSource;
  filters: ReportBuilderState["filters"];
  filterLogic: ReportBuilderState["filterLogic"];
  onFiltersChange: (filters: ReportBuilderState["filters"]) => void;
  onFilterLogicChange: (logic: ReportBuilderState["filterLogic"]) => void;
}) {
  const filterableFields = source.fields.filter(
    (field) => isReportFieldSelectable(field) && (field.filterable === true || field.capabilities?.filterable === true),
  );

  function fieldFor(key: string): ReportsCatalogField | undefined {
    return filterableFields.find((field) => field.key === key);
  }

  function addFilter() {
    const field = filterableFields[0];
    const operator = field && getReportFieldOperators(field)[0];
    if (!field || !operator) return;
    onFiltersChange([...filters, { id: `filter-${filters.length + 1}`, fieldKey: field.key, operator, value: "" }]);
  }

  function updateFilter(index: number, next: Partial<ReportBuilderState["filters"][number]>) {
    onFiltersChange(filters.map((filter, currentIndex) => (currentIndex === index ? { ...filter, ...next } : filter)));
  }

  return (
    <ReportStep
      title="4. Filtros"
      description="Combine condições com AND ou OR. Operadores disponíveis vêm exclusivamente do catálogo."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-800 dark:text-slate-200" htmlFor="report-filter-logic">
            Combinar filtros
          </label>
          <ReportSelect
            id="report-filter-logic"
            className="w-auto min-w-32"
            value={filterLogic}
            onChange={(event) => onFilterLogicChange(event.currentTarget.value as ReportBuilderState["filterLogic"])}
          >
            <option value="and">Todos (AND)</option>
            <option value="or">Qualquer (OR)</option>
          </ReportSelect>
          <Button type="button" variant="outline" size="sm" onClick={addFilter} disabled={filterableFields.length === 0}>
            <Plus aria-hidden="true" /> Adicionar filtro
          </Button>
        </div>

        {filters.length === 0 ? (
          <p className={reportMutedClassName} role="status">
            Nenhum filtro adicionado. A prévia usará todos os registros autorizados.
          </p>
        ) : (
          <div className="space-y-3">
            {filters.map((filter, index) => {
              const field = fieldFor(filter.fieldKey) ?? filterableFields[0];
              const operators = field ? getReportFieldOperators(field) : [];
              return (
                <div key={filter.id ?? index} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] dark:border-slate-700">
                  <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-slate-400">
                    Campo
                    <ReportSelect
                      value={field?.key ?? ""}
                      onChange={(event) => {
                        const nextField = fieldFor(event.currentTarget.value);
                        const nextOperator = nextField && getReportFieldOperators(nextField)[0];
                        updateFilter(index, { fieldKey: event.currentTarget.value, operator: nextOperator ?? "", value: "" });
                      }}
                    >
                      {filterableFields.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
                    </ReportSelect>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-slate-400">
                    Operador
                    <ReportSelect value={filter.operator} onChange={(event) => updateFilter(index, { operator: event.currentTarget.value })}>
                      {operators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                    </ReportSelect>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-gray-600 dark:text-slate-400">
                    Valor
                    <Input value={String(filter.value ?? "")} onChange={(event) => updateFilter(index, { value: event.currentTarget.value })} />
                  </label>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover filtro" onClick={() => onFiltersChange(filters.filter((_, currentIndex) => currentIndex !== index))}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReportStep>
  );
}
