import { Button } from "@shared/ui/newLayout/button";
import type { ReportArea, ReportRelationship, ReportsCatalogSource } from "../types/report.types";
import { defaultRelationship, summaryLabels } from "../utils/reportCriteria";
import { reportCheckboxClassName, reportInputClassName } from "./reportUi";

export function ReportRelationshipSettings({ area, source, onChange, disabled }: {
  area: ReportArea;
  source: ReportsCatalogSource;
  onChange: (area: ReportArea) => void;
  disabled: boolean;
}) {
  const settings = area.relationship ?? defaultRelationship(area, source);
  const chosen = area.fields.map((key) => source.fields.find((field) => field.key === key)).filter((field) => field !== undefined);
  const groupable = chosen.filter((field) => field.groupable && (settings.layout === "summary" || field.sortable));
  const details = area.fields.filter((key) => !settings.dimensions.includes(key));
  const measures = settings.layout === "summary" ? settings.measures : [];
  const available = [...settings.dimensions, ...(settings.layout === "grouped_list" ? details : []), ...measures.map((item) => item.key)];
  const label = (key: string) => {
    const field = chosen.find((item) => item.key === key);
    if (field) return field.label;
    const measure = measures.find((item) => item.key === key);
    if (!measure) return key;
    const measuredField = chosen.find((item) => item.key === measure.field);
    return `${summaryLabels[measure.function]}${measure.field ? ` de ${measuredField?.label ?? "campo"}` : ""}`;
  };
  const update = (next: ReportRelationship) => onChange({ ...area, relationship: next });
  const measureFields = chosen.filter((field) => field.aggregationFunctions?.length);

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 border-t border-gray-200 pt-4 dark:border-slate-700">
      <legend className="px-1 font-semibold text-gray-900 dark:text-white">Relações entre campos</legend>
      <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">Apresentação desta área
        <select className={reportInputClassName} value={settings.layout} onChange={(event) => {
          const layout = event.target.value as ReportRelationship["layout"];
          const dimensions = layout === "grouped_list"
            ? settings.dimensions.filter((key) => chosen.find((field) => field.key === key)?.sortable)
            : settings.dimensions;
          update({ ...settings, layout, dimensions, order: undefined, visibleColumns: layout === "summary"
            ? [...dimensions, ...settings.measures.map((item) => item.key)]
            : area.fields });
        }}>
          <option value="grouped_list">Lista por grupo</option>
          <option value="summary">Resumo por grupo</option>
        </select>
      </label>
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Dimensões</p>
        <p className="text-xs text-gray-600 dark:text-slate-300">Selecione ao menos um campo para formar os grupos.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {groupable.map((field) => <label key={field.key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-slate-200">
            <input type="checkbox" className={reportCheckboxClassName} checked={settings.dimensions.includes(field.key)}
              onChange={() => update({ ...settings, dimensions: settings.dimensions.includes(field.key)
                ? settings.dimensions.filter((key) => key !== field.key)
                : [...settings.dimensions, field.key] })} />{field.label}
          </label>)}
        </div>
      </div>
      {settings.layout === "grouped_list" ? <p className="text-sm text-gray-600 dark:text-slate-300">
        Detalhes: {details.length ? details.map(label).join(", ") : "escolha outro campo na etapa anterior"}.
      </p> : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Medidas</p>
          {measures.map((measure, index) => <div key={measure.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Cálculo {index + 1}
              <select className={reportInputClassName} value={measure.function} onChange={(event) => {
                const fn = event.target.value as typeof measure.function;
                const field = fn === "count_rows" ? undefined : measureFields.find((item) => item.aggregationFunctions?.includes(fn))?.key;
                update({ ...settings, measures: measures.map((item, current) => current === index ? { ...item, function: fn, field } : item) });
              }}>
                {Object.entries(summaryLabels).filter(([key]) => key === "count_rows" || measureFields.some((field) => field.aggregationFunctions?.includes(key))).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            {measure.function !== "count_rows" ? <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Campo
              <select className={reportInputClassName} value={measure.field ?? ""} onChange={(event) => update({ ...settings,
                measures: measures.map((item, current) => current === index ? { ...item, field: event.target.value } : item) })}>
                <option value="">Escolha um campo</option>
                {measureFields.filter((field) => field.aggregationFunctions?.includes(measure.function)).map((field) =>
                  <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
            </label> : <span className="self-end text-xs text-gray-600 dark:text-slate-300">Todos os registros do grupo</span>}
            <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => update({ ...settings,
              measures: measures.filter((_, current) => current !== index),
              visibleColumns: settings.visibleColumns.filter((key) => key !== measure.key) })}>Remover medida {index + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const used = new Set([...area.fields, ...measures.map((item) => item.key)]);
            let number = 1;
            while (used.has(`report_measure_${number}`)) number++;
            const key = `report_measure_${number}`;
            update({ ...settings, measures: [...measures, { key, function: "count_rows" }],
              visibleColumns: [...settings.visibleColumns, key] });
          }}>Adicionar medida</Button>
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-slate-200">Colunas visíveis</p>
        <p className="text-xs text-gray-600 dark:text-slate-300">Campos ocultos continuam autorizados e podem apoiar filtros ou gráficos.</p>
        {settings.layout === "summary" && settings.dimensions.some((key) => !settings.visibleColumns.includes(key)) ? (
          <p className="text-xs text-amber-900 dark:text-amber-200">Dimensões ocultas ainda separam grupos; grupos diferentes podem parecer linhas iguais na tabela.</p>
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {available.map((key) => <label key={key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-slate-200">
            <input type="checkbox" className={reportCheckboxClassName} checked={settings.visibleColumns.includes(key)}
              onChange={() => update({ ...settings, visibleColumns: settings.visibleColumns.includes(key)
                ? settings.visibleColumns.filter((item) => item !== key)
                : [...settings.visibleColumns, key] })} />{label(key)}
          </label>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Ordenar por
          <select className={reportInputClassName} value={settings.order?.key ?? ""} onChange={(event) => update({ ...settings,
            order: event.target.value ? { key: event.target.value, direction: settings.order?.direction ?? "asc" } : undefined })}>
            <option value="">Ordem padrão</option>
            {[...settings.dimensions, ...(settings.layout === "grouped_list" ? details.filter((key) => chosen.find((field) => field.key === key)?.sortable) : []), ...measures.map((item) => item.key)].map((key) => <option key={key} value={key}>{label(key)}</option>)}
          </select>
        </label>
        {settings.order ? <label className="text-sm font-medium text-gray-800 dark:text-slate-200">Direção
          <select className={reportInputClassName} value={settings.order.direction} onChange={(event) => update({ ...settings,
            order: { ...settings.order!, direction: event.target.value as "asc" | "desc" } })}>
            <option value="asc">Crescente</option><option value="desc">Decrescente</option>
          </select>
        </label> : null}
      </div>
    </fieldset>
  );
}
