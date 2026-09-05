import { Plus, Trash2 } from "lucide-react";

import { Button } from "@shared/ui/newLayout/button";
import { Input } from "@shared/ui/newLayout/input";

import type {
  ReportAggregation,
  ReportBuilderState,
  ReportsCatalogField,
  ReportsCatalogSource,
} from "../types/report.types";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { ReportSelect, ReportStep, reportMutedClassName } from "./ReportStep";

export function ReportOrganizationStep({
  source,
  state,
  onStateChange,
}: {
  source: ReportsCatalogSource;
  state: ReportBuilderState;
  onStateChange: (state: ReportBuilderState) => void;
}) {
  const fields = getSelectableReportFields(source);
  const groupableFields = fields.filter(
    (field) => field.groupable === true || field.capabilities?.groupable === true,
  );
  const sortableFields = fields.filter(
    (field) => field.sortable === true || field.capabilities?.sortable === true,
  );
  const aggregatableFields = fields.filter(
    (field) => field.aggregatable === true || field.capabilities?.aggregatable === true,
  );

  function update<K extends keyof ReportBuilderState>(key: K, value: ReportBuilderState[K]) {
    onStateChange({ ...state, [key]: value });
  }

  function aggregationFunctions(field: ReportsCatalogField) {
    return field.aggregationFunctions ?? field.capabilities?.aggregationFunctions ?? [];
  }

  function addAggregation() {
    const field = aggregatableFields[0];
    const fn = field && aggregationFunctions(field)[0];
    if (field && fn) {
      update("aggregations", [...state.aggregations, { fieldKey: field.key, function: fn }]);
    }
  }

  return (
    <ReportStep
      title="5. Organização e parâmetros"
      description="Defina parâmetros publicados, agrupamentos, agregações e ordenação."
    >
      <div className="space-y-8">
        <section className="space-y-3" aria-labelledby="report-parameters-title">
          <h3 id="report-parameters-title" className="font-medium text-gray-900 dark:text-white">
            Parâmetros
          </h3>
          {source.parameters?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {source.parameters.map((parameter) => (
                <label
                  key={parameter.key}
                  className="space-y-1 text-sm font-medium text-gray-800 dark:text-slate-200"
                >
                  {parameter.label}
                  {parameter.type === "select" ? (
                    <ReportSelect
                      value={String(state.parameters[parameter.key] ?? "")}
                      onChange={(event) =>
                        update("parameters", {
                          ...state.parameters,
                          [parameter.key]: event.currentTarget.value,
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {(parameter.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </ReportSelect>
                  ) : parameter.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(state.parameters[parameter.key])}
                      onChange={(event) =>
                        update("parameters", {
                          ...state.parameters,
                          [parameter.key]: event.currentTarget.checked,
                        })
                      }
                      className="ml-2 h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                  ) : (
                    <Input
                      type={parameter.type}
                      value={String(state.parameters[parameter.key] ?? "")}
                      onChange={(event) =>
                        update("parameters", {
                          ...state.parameters,
                          [parameter.key]: event.currentTarget.value,
                        })
                      }
                      required={parameter.required}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className={reportMutedClassName}>Esta fonte não publicou parâmetros.</p>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="report-group-title">
          <h3 id="report-group-title" className="font-medium text-gray-900 dark:text-white">
            Agrupamentos
          </h3>
          {groupableFields.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupableFields.map((field) => (
                <label
                  key={field.key}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={state.groupBy.includes(field.key)}
                    onChange={(event) =>
                      update(
                        "groupBy",
                        event.currentTarget.checked
                          ? [...new Set([...state.groupBy, field.key])]
                          : state.groupBy.filter((key) => key !== field.key),
                      )
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          ) : (
            <p className={reportMutedClassName}>Nenhum agrupamento foi publicado.</p>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="report-aggregation-title">
          <div className="flex flex-wrap items-center gap-3">
            <h3
              id="report-aggregation-title"
              className="font-medium text-gray-900 dark:text-white"
            >
              Agregações
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAggregation}
              disabled={!aggregatableFields.length}
            >
              <Plus aria-hidden="true" /> Adicionar
            </Button>
          </div>
          {state.aggregations.map((aggregation: ReportAggregation, index) => {
            const field =
              aggregatableFields.find((candidate) => candidate.key === aggregation.fieldKey) ??
              aggregatableFields[0];
            const functions = field ? aggregationFunctions(field) : [];

            return (
              <div
                key={`${aggregation.fieldKey}-${index}`}
                className="flex flex-wrap items-center gap-2"
              >
                <ReportSelect
                  className="max-w-xs"
                  value={field?.key ?? ""}
                  onChange={(event) => {
                    const nextField = aggregatableFields.find(
                      (candidate) => candidate.key === event.currentTarget.value,
                    );
                    const nextFn = nextField && aggregationFunctions(nextField)[0];
                    update(
                      "aggregations",
                      state.aggregations.map((item, currentIndex) =>
                        currentIndex === index
                          ? { fieldKey: event.currentTarget.value, function: nextFn ?? "" }
                          : item,
                      ),
                    );
                  }}
                >
                  {aggregatableFields.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>
                      {candidate.label}
                    </option>
                  ))}
                </ReportSelect>
                <ReportSelect
                  className="max-w-xs"
                  value={aggregation.function}
                  onChange={(event) =>
                    update(
                      "aggregations",
                      state.aggregations.map((item, currentIndex) =>
                        currentIndex === index
                          ? { ...item, function: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                >
                  {functions.map((fn) => (
                    <option key={fn} value={fn}>
                      {fn}
                    </option>
                  ))}
                </ReportSelect>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover agregação"
                  onClick={() =>
                    update(
                      "aggregations",
                      state.aggregations.filter((_, currentIndex) => currentIndex !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {!state.aggregations.length && (
            <p className={reportMutedClassName}>Nenhuma agregação adicionada.</p>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="report-order-title">
          <h3 id="report-order-title" className="font-medium text-gray-900 dark:text-white">
            Ordenação
          </h3>
          {sortableFields.length ? (
            <div className="space-y-2">
              {state.orderBy.map((sort, index) => (
                <div
                  key={`${sort.fieldKey}-${index}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <ReportSelect
                    className="max-w-xs"
                    value={sort.fieldKey}
                    onChange={(event) =>
                      update(
                        "orderBy",
                        state.orderBy.map((item, currentIndex) =>
                          currentIndex === index
                            ? { ...item, fieldKey: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  >
                    {sortableFields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </ReportSelect>
                  <ReportSelect
                    className="w-auto"
                    value={sort.direction}
                    onChange={(event) =>
                      update(
                        "orderBy",
                        state.orderBy.map((item, currentIndex) =>
                          currentIndex === index
                            ? {
                                ...item,
                                direction: event.currentTarget.value as "asc" | "desc",
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="asc">Crescente</option>
                    <option value="desc">Decrescente</option>
                  </ReportSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover ordenação"
                    onClick={() =>
                      update(
                        "orderBy",
                        state.orderBy.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update("orderBy", [
                    ...state.orderBy,
                    { fieldKey: sortableFields[0].key, direction: "asc" },
                  ])
                }
              >
                <Plus aria-hidden="true" /> Adicionar ordenação
              </Button>
            </div>
          ) : (
            <p className={reportMutedClassName}>Nenhuma ordenação foi publicada.</p>
          )}
        </section>

        <p className={reportMutedClassName}>
          O limite da prévia é aplicado pelo backend e exibido no resultado.
        </p>
      </div>
    </ReportStep>
  );
}
