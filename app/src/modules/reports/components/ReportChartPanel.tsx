import dynamic from "next/dynamic";
import { useState } from "react";

import type { ReportPreviewColumn } from "../types/report.types";
import { reportInputClassName } from "./reportUi";
import type { ChartRow, ChartSeries } from "./ReportChartView";

const Chart = dynamic(() => import("./ReportChartView")
  .then((module) => module.ReportChartView)
  .catch(() => function ChartUnavailable() {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Não foi possível carregar o gráfico. Os dados seguem na tabela.</p>;
  }), {
  ssr: false,
  loading: () => <p role="status" className="py-8 text-sm text-gray-600 dark:text-slate-300">Carregando gráfico...</p>,
});

type ChartType = "table" | "bar" | "line" | "pie";
type Order = "dimension_asc" | "dimension_desc" | "measure_asc" | "measure_desc";

function labelFor(key: string, columns: readonly ReportPreviewColumn[], fallback: string): string {
  return columns.find((column) => column.key === key)?.label ?? fallback;
}

function category(value: unknown): string {
  return value == null ? "Sem valor" : String(value);
}

function categoryKey(value: unknown): string {
  return JSON.stringify([value == null ? "null" : typeof value, value ?? null]);
}

function categoryLabel(value: unknown, values: readonly unknown[]): string {
  const label = category(value);
  if (!values.some((other) => category(other) === label && categoryKey(other) !== categoryKey(value))) return label;
  const type = value == null ? "ausente" : typeof value === "string" ? "texto" : typeof value === "number" ? "número" : "booleano";
  return `${label} (${type})`;
}

export function ReportChartPanel({
  columns,
  rows,
  dimensions = [],
  rowCount,
  hasMore = false,
}: {
  columns: readonly ReportPreviewColumn[];
  rows: readonly Record<string, unknown>[];
  dimensions?: readonly string[];
  rowCount?: number;
  hasMore?: boolean;
}) {
  const keys = Object.keys(rows[0] ?? {});
  const numeric = keys.filter((key) =>
    rows.some((row) => typeof row[key] === "number" && Number.isFinite(row[key])) &&
    rows.every((row) => row[key] == null || (typeof row[key] === "number" && Number.isFinite(row[key]))),
  );
  const [type, setType] = useState<ChartType>("table");
  const [chosenDimension, setDimension] = useState("");
  const [chosenMeasure, setMeasure] = useState("");
  const [chosenSeries, setSeries] = useState("");
  const [order, setOrder] = useState<Order>("dimension_asc");
  const measure = numeric.includes(chosenMeasure) ? chosenMeasure : numeric[0] ?? "";
  const dimensionOptions = keys.filter((key) => key !== measure);
  const dimension = dimensionOptions.includes(chosenDimension)
    ? chosenDimension
    : dimensions.find((key) => dimensionOptions.includes(key)) ?? dimensionOptions[0] ?? "";
  const seriesOptions = keys.filter((key) => key !== measure && key !== dimension && !numeric.includes(key));
  const seriesKey = type !== "pie" && seriesOptions.includes(chosenSeries) ? chosenSeries : "";
  const points = rows.map((row) => ({
    dimension: row[dimension],
    series: seriesKey ? row[seriesKey] : undefined,
    value: row[measure],
  }));
  let guidance = "";
  if (!measure) guidance = "Escolha um resumo numérico para criar um gráfico. A tabela continua disponível.";
  else if (!dimension) guidance = "Escolha uma dimensão para organizar o gráfico.";
  else if (rows.length > 40) guidance = "O gráfico aceita até 40 pontos por página. Refine o relatório para continuar.";
  else if (points.some((point) => typeof point.value !== "number" || !Number.isFinite(point.value))) {
    guidance = "A medida contém valores ausentes. Ajuste os dados antes de desenhar o gráfico.";
  } else if (type === "line" && !points.every((point) =>
    typeof point.dimension === "number" ||
    (typeof point.dimension === "string" && /^\d{4}-\d{2}-\d{2}/u.test(point.dimension) && Number.isFinite(Date.parse(point.dimension))),
  )) {
    guidance = "Gráficos de linha exigem uma dimensão de data ou número.";
  } else if (type === "pie" && (rows.length > 12 || points.some((point) => Number(point.value) < 0) || points.every((point) => point.value === 0))) {
    guidance = "Gráficos de setores aceitam até 12 categorias, sem série e com valores não negativos.";
  }
  const seriesValues = [...new Map(points.map((point) => [categoryKey(point.series), point.series])).values()];
  if (!guidance && seriesKey && seriesValues.length > 5) guidance = "Use no máximo cinco valores de série.";
  if (!guidance) {
    const pairs = points.map((point) => JSON.stringify([categoryKey(point.dimension), seriesKey ? categoryKey(point.series) : null]));
    if (new Set(pairs).size !== pairs.length) {
      guidance = "Há mais de um valor para a mesma categoria e série. Resuma os dados antes de criar o gráfico.";
    }
  }

  const ordered = [...points].sort((left, right) => {
    const byMeasure = order.startsWith("measure");
    const comparison = byMeasure
      ? Number(left.value) - Number(right.value)
      : category(left.dimension).localeCompare(category(right.dimension), "pt-BR", { numeric: true });
    return order.endsWith("desc") ? -comparison : comparison;
  });
  const series: ChartSeries[] = seriesKey
    ? seriesValues.map((value, index) => ({ key: `series_${index}`, label: categoryLabel(value, seriesValues) }))
    : [{ key: "value", label: labelFor(measure, columns, "Medida") }];
  const dimensionValues = [...new Map(ordered.map((point) => [categoryKey(point.dimension), point.dimension])).values()];
  const chartRows: ChartRow[] = seriesKey
    ? dimensionValues.map((value) => {
        const group: ChartRow = { name: categoryLabel(value, dimensionValues) };
        for (const point of ordered.filter((item) => categoryKey(item.dimension) === categoryKey(value))) {
          const index = seriesValues.findIndex((item) => categoryKey(item) === categoryKey(point.series));
          group[`series_${index}`] = Number(point.value);
        }
        return group;
      })
    : ordered.map((point) => ({ name: categoryLabel(point.dimension, dimensionValues), value: Number(point.value) }));
  const title = `${labelFor(measure, columns, "Medida")} por ${labelFor(dimension, columns, "Dimensão")}`;

  return (
    <section className="space-y-4 border-t border-gray-200 pt-4 dark:border-slate-700" aria-label="Visualização gráfica">
      <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
        Visualização
        <select className={reportInputClassName} value={type} onChange={(event) => setType(event.target.value as ChartType)}>
          <option value="table">Somente tabela</option>
          <option value="bar">Barras</option>
          <option value="line">Linha</option>
          <option value="pie">Setores</option>
        </select>
      </label>
      {type !== "table" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-800 dark:text-slate-200">Dimensão
              <select className={reportInputClassName} value={dimension} onChange={(event) => setDimension(event.target.value)}>
                {dimensionOptions.map((key, index) => <option key={key} value={key}>{labelFor(key, columns, `Dimensão ${index + 1}`)}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-800 dark:text-slate-200">Medida
              <select className={reportInputClassName} value={measure} onChange={(event) => setMeasure(event.target.value)}>
                {numeric.map((key, index) => <option key={key} value={key}>{labelFor(key, columns, `Medida ${index + 1}`)}</option>)}
              </select>
            </label>
            {type !== "pie" ? (
              <label className="text-sm text-gray-800 dark:text-slate-200">Série
                <select className={reportInputClassName} value={seriesKey} onChange={(event) => setSeries(event.target.value)}>
                  <option value="">Sem série</option>
                  {seriesOptions.map((key, index) => <option key={key} value={key}>{labelFor(key, columns, `Série ${index + 1}`)}</option>)}
                </select>
              </label>
            ) : null}
            <label className="text-sm text-gray-800 dark:text-slate-200">Ordem
              <select className={reportInputClassName} value={order} onChange={(event) => setOrder(event.target.value as Order)}>
                <option value="dimension_asc">Dimensão crescente</option>
                <option value="dimension_desc">Dimensão decrescente</option>
                <option value="measure_desc">Maior medida primeiro</option>
                <option value="measure_asc">Menor medida primeiro</option>
              </select>
            </label>
          </div>
          {guidance ? <p role="alert" className="text-sm text-amber-900 dark:text-amber-200">{guidance}</p> : (
            <>
              <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
              <Chart type={type} rows={chartRows} series={series} title={title} />
              <details className="rounded border border-gray-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                <summary className="cursor-pointer font-medium text-gray-800 dark:text-slate-200">Ver valores do gráfico</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-gray-800 dark:text-slate-200">
                    <thead><tr><th scope="col" className="px-2 py-1">{labelFor(dimension, columns, "Dimensão")}</th>{series.map((item) => <th key={item.key} scope="col" className="px-2 py-1">{item.label}</th>)}</tr></thead>
                    <tbody>{chartRows.map((row, index) => <tr key={`${row.name}-${index}`} className="border-t border-gray-200 dark:border-slate-700">
                      <th scope="row" className="px-2 py-1 font-normal">{row.name}</th>
                      {series.map((item) => <td key={item.key} className="px-2 py-1">{row[item.key] ?? "—"}</td>)}
                    </tr>)}</tbody>
                  </table>
                </div>
              </details>
              <p className="text-xs text-gray-600 dark:text-slate-300">
                {(rowCount !== undefined && rowCount > rows.length) || hasMore
                  ? `Gráfico dos ${rows.length} registros carregados nesta página; o relatório possui mais dados.`
                  : `Gráfico dos ${rows.length} registros apresentados na tabela.`}
              </p>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
