import { Button } from "@shared/ui/newLayout/button";
import type { ReportArea, ReportsCatalogSource } from "../types/report.types";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { operatorLabels, summaryLabels } from "../utils/reportCriteria";
import { reportCheckboxClassName, reportInputClassName as inputClass } from "./reportUi";

export function ReportCriteriaStep({
  area,
  source,
  onChange,
  disabled,
  relationshipMode = false,
}: {
  area: ReportArea;
  source: ReportsCatalogSource;
  onChange: (area: ReportArea) => void;
  disabled: boolean;
  relationshipMode?: boolean;
}) {
  const fields = getSelectableReportFields(source);
  const filterFields = fields.filter(
    (field) => field.filterable && field.operators?.some((operator) => operatorLabels[operator]),
  );
  const filters = area.filters ?? [];
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 border-t border-gray-200 pt-4 dark:border-slate-700"
    >
      <legend className="px-1 text-lg font-semibold text-gray-900 dark:text-white">
        {source.label}
      </legend>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        Sem critérios, todos os registros autorizados desta área serão considerados.
      </p>
      {(source.parameters ?? []).map((parameter) => (
        <label
          key={parameter.key}
          className="block text-sm font-medium text-gray-800 dark:text-slate-200"
        >
          {parameter.label}
          {parameter.required ? " (obrigatório)" : ""}
          {parameter.type === "select" || parameter.type === "boolean" ? (
            <select
              className={inputClass}
              required={parameter.required}
              value={String(area.parameterValues?.[parameter.key] ?? "")}
              onChange={(event) =>
                onChange({
                  ...area,
                  parameterValues: { ...area.parameterValues, [parameter.key]: event.target.value },
                })
              }
            >
              <option value="">Escolha uma opção</option>
              {(parameter.type === "boolean"
                ? [
                    { value: "true", label: "Sim" },
                    { value: "false", label: "Não" },
                  ]
                : (parameter.options ?? [])
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputClass}
              required={parameter.required}
              type={parameter.type === "text" ? "text" : parameter.type}
              value={String(area.parameterValues?.[parameter.key] ?? "")}
              onChange={(event) =>
                onChange({
                  ...area,
                  parameterValues: { ...area.parameterValues, [parameter.key]: event.target.value },
                })
              }
            />
          )}
        </label>
      ))}
      {filters.length ? (
        <label className="block text-sm font-medium text-gray-800 dark:text-slate-200">
          Combinar critérios
          <select
            className={inputClass}
            value={area.filterLogic ?? "and"}
            onChange={(event) =>
              onChange({ ...area, filterLogic: event.target.value as "and" | "or" })
            }
          >
            <option value="and">Todos os critérios</option>
            <option value="or">Pelo menos um critério</option>
          </select>
        </label>
      ) : null}
      {filters.map((filter, index) => {
        const field = fields.find((item) => item.key === filter.field);
        const list = filter.operator === "in" || filter.operator === "between";
        const update = (patch: Partial<typeof filter>) =>
          onChange({
            ...area,
            filters: filters.map((item, current) =>
              current === index ? { ...item, ...patch } : item,
            ),
          });
        return (
          <div
            key={index}
            className="grid items-end gap-3 border-b border-gray-100 pb-4 sm:grid-cols-2 dark:border-slate-800"
          >
            <label className="text-sm text-gray-800 dark:text-slate-200">
              Campo do critério {index + 1}
              <select
                className={inputClass}
                value={filter.field}
                onChange={(event) =>
                  update({
                    field: event.target.value,
                    operator:
                      filterFields.find((item) => item.key === event.target.value)
                        ?.operators?.[0] ?? "eq",
                    value: "",
                  })
                }
              >
                {filterFields.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-800 dark:text-slate-200">
              Condição {index + 1}
              <select
                className={inputClass}
                value={filter.operator}
                onChange={(event) => update({ operator: event.target.value, value: "" })}
              >
                {field?.operators
                  ?.filter((operator) => operatorLabels[operator])
                  .map((operator) => (
                    <option key={operator} value={operator}>
                      {operatorLabels[operator]}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm text-gray-800 dark:text-slate-200">
              Valor do critério {index + 1}
              {field?.type === "boolean" && !list ? (
                <select
                  className={inputClass}
                  value={String(filter.value)}
                  onChange={(event) => update({ value: event.target.value })}
                >
                  <option value="">Escolha uma opção</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              ) : (
                <input
                  className={inputClass}
                  type={!list && field?.type === "date" ? "date" : "text"}
                  value={
                    Array.isArray(filter.value)
                      ? filter.value.join("; ")
                      : String(filter.value ?? "")
                  }
                  onChange={(event) => update({ value: event.target.value })}
                />
              )}
              {list ? (
                <span className="mt-1 block text-xs text-gray-600 dark:text-slate-300">
                  {filter.operator === "between"
                    ? "Separe os dois extremos por ponto e vírgula."
                    : "Separe os valores por ponto e vírgula."}
                </span>
              ) : null}
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ ...area, filters: filters.filter((_, current) => current !== index) })
              }
            >
              Remover critério {index + 1}
            </Button>
          </div>
        );
      })}
      {filterFields.length ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({
              ...area,
              filters: [
                ...filters,
                { field: filterFields[0].key, operator: filterFields[0].operators![0], value: "" },
              ],
            })
          }
        >
          Adicionar critério
        </Button>
      ) : (
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Esta área não oferece critérios adicionais.
        </p>
      )}
      {!relationshipMode ? <details className="border-t border-gray-200 pt-4 dark:border-slate-700">
        <summary className="cursor-pointer rounded text-sm font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-white">
          Mais opções
        </summary>
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-gray-800 dark:text-slate-200">
              Agrupamento
            </legend>
            {fields
              .filter((field) => field.groupable)
              .map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 text-sm text-gray-800 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    className={reportCheckboxClassName}
                    checked={area.groupBy?.includes(field.key) ?? false}
                    onChange={() =>
                      onChange({
                        ...area,
                        groupBy: area.groupBy?.includes(field.key)
                          ? area.groupBy.filter((key) => key !== field.key)
                          : [...(area.groupBy ?? []), field.key],
                      })
                    }
                  />
                  {field.label}
                </label>
              ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-gray-800 dark:text-slate-200">
              Resumo e contagem
            </legend>
            <p className="text-xs text-gray-600 dark:text-slate-300">
              A contagem considera valores preenchidos. Com resumo, aparecem os grupos e os totais
              escolhidos.
            </p>
            {fields
              .filter((field) => field.aggregationFunctions?.length)
              .map((field) => (
                <label key={field.key} className="block text-sm text-gray-800 dark:text-slate-200">
                  Resumo de {field.label}
                  <select
                    className={inputClass}
                    value={
                      area.aggregations?.find((item) => item.field === field.key)?.function ?? ""
                    }
                    onChange={(event) =>
                      onChange({
                        ...area,
                        aggregations: [
                          ...(area.aggregations ?? []).filter((item) => item.field !== field.key),
                          ...(event.target.value
                            ? [{ field: field.key, function: event.target.value }]
                            : []),
                        ],
                      })
                    }
                  >
                    <option value="">Sem resumo</option>
                    {field.aggregationFunctions
                      ?.filter((name) => summaryLabels[name])
                      .map((name) => (
                        <option key={name} value={name}>
                          {summaryLabels[name]}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-gray-800 dark:text-slate-200">
              Ordenação
            </legend>
            {fields
              .filter((field) => field.sortable)
              .map((field) => (
                <label key={field.key} className="block text-sm text-gray-800 dark:text-slate-200">
                  Ordenar por {field.label}
                  <select
                    className={inputClass}
                    value={area.orderBy?.find((item) => item.field === field.key)?.direction ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...area,
                        orderBy: [
                          ...(area.orderBy ?? []).filter((item) => item.field !== field.key),
                          ...(event.target.value
                            ? [
                                {
                                  field: field.key,
                                  direction: event.target.value as "asc" | "desc",
                                },
                              ]
                            : []),
                        ],
                      })
                    }
                  >
                    <option value="">Sem ordenação</option>
                    <option value="asc">Crescente</option>
                    <option value="desc">Decrescente</option>
                  </select>
                </label>
              ))}
          </fieldset>
        </div>
      </details> : null}
    </fieldset>
  );
}
