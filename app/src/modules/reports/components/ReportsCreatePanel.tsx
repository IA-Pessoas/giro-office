import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@shared/services/toast";
import { Dialog } from "@shared/components";
import { Button } from "@shared/ui/newLayout/button";
import { useReportBuilder } from "../hooks/useReportBuilder";
import { useReportsCatalog } from "../hooks/useReportsCatalog";
import { reportsCatalogQueryKey } from "../hooks/queryKeys";
import { reportsService } from "../services/reportsService";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { getPessoalReportPresets, type PessoalReportPreset } from "../utils/pessoalReportPresets";
import { ReportFieldsStep } from "./ReportFieldsStep";
import { ReportCriteriaStep } from "./ReportCriteriaStep";
import { buildReportComposition, operatorLabels, summaryLabels } from "../utils/reportCriteria";
import type { ReportArea } from "../types/report.types";
import { ReportSourceStep } from "./ReportSourceStep";
import { getErrorStatus, getReportForbiddenMessage, isReportCsrfError } from "./reportUi";
import {
  useCancelReportJobMutation,
  useCreateReportJobMutation,
  useCreateReportModelMutation,
  useReportJob,
  useReportSnapshot,
} from "../hooks/useReports";
import { ReportResultBlocks } from "./ReportResultBlocks";
import type { ReportModel } from "../types/report.types";
import { ReportDownloadActions } from "./ReportDownloadActions";

const steps = ["Escolher áreas", "Escolher campos", "Definir critérios", "Revisar relatório"];

function legacyDefinitionToAreas(model: ReportModel) {
  const definition = model.definition;
  if ("areas" in definition) return definition.areas;
  return definition.sources.map((source) => ({
    source,
    fields: definition.columns
      .filter((column) => column.source === source)
      .map((column) => column.field),
    filters: definition.filters
      .filter((filter) => filter.source === source)
      .map((filter) => ({
        field: filter.field,
        operator: filter.operator,
        value: filter.parameter,
      })),
    groupBy: definition.group_by
      ?.filter((item) => item.source === source)
      .map((item) => item.field),
    aggregations: definition.aggregations
      .filter((item) => item.source === source)
      .map((item) => ({ field: item.field, function: item.function })),
    orderBy: definition.order_by
      .filter((item) => item.source === source)
      .map((item) => ({ field: item.field, direction: item.direction })),
  }));
}

export function ReportsCreatePanel({
  model,
  onModelLoaded,
}: {
  model?: ReportModel | null;
  onModelLoaded?: () => void;
}) {
  const catalog = useReportsCatalog();
  const builder = useReportBuilder();
  const queryClient = useQueryClient();
  const review = useMutation({ mutationFn: reportsService.validateDefinition });
  const preview = useMutation({ mutationFn: reportsService.previewComposition });
  const createJob = useCreateReportJobMutation();
  const createModel = useCreateReportModelMutation();
  const cancelJob = useCancelReportJobMutation();
  const [generatedJobId, setGeneratedJobId] = useState<string | null>(null);
  const job = useReportJob(generatedJobId);
  const snapshot = useReportSnapshot(
    job.data?.status === "completed" ? generatedJobId : null,
    "personal",
  );
  const [previewConfiguration, setPreviewConfiguration] = useState("");
  const busy =
    review.isPending ||
    preview.isPending ||
    createJob.isPending ||
    cancelJob.isPending ||
    job.data?.status === "queued" ||
    job.data?.status === "processing";
  const configuration = JSON.stringify(builder.areas);
  const stale = Boolean(preview.data && previewConfiguration !== configuration);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loadedModel, setLoadedModel] = useState<ReportModel | null>(null);
  const [loadedModelVersionId, setLoadedModelVersionId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (step > 0) contentRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!model) return;
    builder.setAreas(legacyDefinitionToAreas(model));
    setLoadedModel(model);
    setLoadedModelVersionId(model.version_id ?? null);
    setGeneratedJobId(null);
    createJob.reset();
    preview.reset();
    review.reset();
    setPreviewConfiguration("");
    setError("");
    setStep(3);
    onModelLoaded?.();
  }, [model]);

  const sources = catalog.data?.items ?? [];
  // Presets de Pessoal só fazem sentido antes de escolher áreas ou com áreas de Pessoal.
  const pessoalPresets = builder.areas.every((area) => area.source.startsWith("pessoal."))
    ? getPessoalReportPresets(sources)
    : [];
  const selected = builder.areas.map((area) => ({
    ...area,
    catalog: sources.find((source) => source.key === area.source),
  }));
  const unavailable = selected.some(
    (area) =>
      !area.catalog ||
      [
        ...area.fields,
        ...(area.filters ?? []).map((item) => item.field),
        ...(area.groupBy ?? []),
        ...(area.aggregations ?? []).map((item) => item.field),
        ...(area.orderBy ?? []).map((item) => item.field),
      ].some((key) => !getSelectableReportFields(area.catalog!).some((field) => field.key === key)),
  );
  const empty = selected.filter((area) => area.fields.length === 0);

  function clearGeneratedResult() {
    setGeneratedJobId(null);
    createJob.reset();
  }

  function clearLoadedModel() {
    setLoadedModel(null);
    setLoadedModelVersionId(null);
  }

  function changeArea(source: string) {
    if (busy) return;
    builder.toggleArea(source);
    clearLoadedModel();
    clearGeneratedResult();
    setError("");
    review.reset();
    if (step >= 2) setStep(1);
  }
  function updateArea(area: ReportArea) {
    builder.setAreas((current) =>
      current.map((item) => (item.source === area.source ? area : item)),
    );
    clearLoadedModel();
    clearGeneratedResult();
    setError("");
    review.reset();
  }
  function applyPreset(preset: PessoalReportPreset) {
    if (busy) return;
    builder.setAreas(
      preset.areas.map((area) => ({
        ...area,
        fields: [...area.fields],
        ...(area.filters ? { filters: area.filters.map((filter) => ({ ...filter })) } : {}),
      })),
    );
    clearLoadedModel();
    clearGeneratedResult();
    setError("");
    review.reset();
    preview.reset();
    setStep(1);
  }
  async function generateReport() {
    if (busy || unavailable) return;
    setError("");
    try {
      const definition = buildReportComposition(builder.areas, sources);
      const created = await createJob.mutateAsync(
        loadedModelVersionId ? { modelVersionId: loadedModelVersionId } : definition,
      );
      setGeneratedJobId(created.id);
    } catch (cause) {
      const status = getErrorStatus(cause);
      const csrfFailure = isReportCsrfError(cause);
      setError(
        status === 403
          ? getReportForbiddenMessage(
              cause,
              "Seu acesso mudou. Confira as áreas e os campos disponíveis e tente novamente.",
            )
          : status === 400
            ? "Confira os critérios, parâmetros e opções de cada área e tente novamente."
            : "Não foi possível iniciar a geração. Tente novamente.",
      );
      if (status === 403 && !csrfFailure)
        await queryClient.invalidateQueries({ queryKey: reportsCatalogQueryKey() });
    }
  }
  async function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!name) {
      setError("Informe um nome para salvar o modelo.");
      return;
    }
    try {
      await createModel.mutateAsync({
        name,
        ...(description ? { description } : {}),
        definition:
          loadedModel && loadedModelVersionId
            ? loadedModel.definition
            : buildReportComposition(builder.areas, sources),
      });
      setSaveDialogOpen(false);
      toast.success("Modelo salvo para usar novamente.");
    } catch (cause) {
      const status = getErrorStatus(cause);
      const csrfFailure = isReportCsrfError(cause);
      setError(
        status === 403
          ? getReportForbiddenMessage(cause, "Seu acesso mudou. Não foi possível salvar este modelo.")
          : "Não foi possível salvar o modelo. Tente novamente.",
      );
      if (status === 403 && !csrfFailure) {
        await queryClient.invalidateQueries({ queryKey: reportsCatalogQueryKey() });
      }
    }
  }
  async function cancelGeneratedReport() {
    if (!generatedJobId) return;
    try {
      await cancelJob.mutateAsync(generatedJobId);
    } catch {
      setError("Não foi possível cancelar a geração. Tente novamente.");
    }
  }
  async function showPreview() {
    if (busy) return;
    setError("");
    try {
      await preview.mutateAsync(buildReportComposition(builder.areas, sources));
      setPreviewConfiguration(configuration);
    } catch (cause) {
      const status = getErrorStatus(cause);
      const csrfFailure = isReportCsrfError(cause);
      setError(
        status === 403
          ? getReportForbiddenMessage(
              cause,
              "Seu acesso mudou. Confira as áreas e os campos disponíveis e tente novamente.",
            )
          : status === 422
            ? "Esta consulta excede a capacidade disponível. Reduza as áreas ou ajuste os critérios e tente novamente."
            : status === 400
              ? "Confira os critérios, parâmetros e opções de cada área e tente novamente."
              : "Não foi possível visualizar a prévia. Tente novamente.",
      );
      if (status === 403 && !csrfFailure) {
        preview.reset();
        await queryClient.invalidateQueries({ queryKey: reportsCatalogQueryKey() });
      }
    }
  }
  async function goTo(target: number) {
    if (busy) return;
    setError("");
    if (target === 0) {
      setStep(0);
      return;
    }
    if (!selected.length) {
      setError("Escolha ao menos uma área para continuar.");
      return;
    }
    if (target === 1) {
      setStep(1);
      return;
    }
    if (unavailable) {
      setError(
        "Uma área ou campo não está mais disponível. Volte às escolhas e ajuste seu relatório.",
      );
      return;
    }
    if (empty.length) {
      setError(
        `Escolha ao menos um campo em: ${empty.map((area) => area.catalog?.label).join(", ")}. Você também pode remover a área.`,
      );
      return;
    }
    if (target === 2) {
      setStep(2);
      return;
    }
    let definition;
    try {
      definition = buildReportComposition(builder.areas, sources);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confira os critérios da área.");
      return;
    }
    try {
      await review.mutateAsync(definition);
      setStep(3);
    } catch (cause) {
      const status = getErrorStatus(cause);
      const csrfFailure = isReportCsrfError(cause);
      setError(
        status === 403
          ? getReportForbiddenMessage(
              cause,
              "Seu acesso mudou. Confira as áreas e os campos disponíveis e tente novamente.",
            )
          : status === 400
            ? "Não foi possível revisar essas escolhas. Confira campos, critérios, parâmetros e opções; reduza as áreas se necessário."
            : "Não foi possível revisar o relatório. Tente novamente.",
      );
      if (status === 403 && !csrfFailure) {
        preview.reset();
        await queryClient.invalidateQueries({ queryKey: reportsCatalogQueryKey() });
      }
    }
  }

  if (catalog.isPending)
    return (
      <p role="status" className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando áreas...
      </p>
    );
  if (catalog.isError)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-red-600 dark:text-red-400">
          Não foi possível carregar as áreas. Tente novamente.
        </p>
        <Button type="button" variant="outline" onClick={() => catalog.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!sources.length)
    return (
      <p role="status" className="text-gray-600 dark:text-slate-300">
        Nenhuma área está disponível para seu perfil.
      </p>
    );

  return (
    <div className="space-y-6">
      {pessoalPresets.length ? (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Presets de Pessoal</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
            Comece por uma estrutura pronta e ajuste os critérios antes de gerar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pessoalPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                title={preset.description}
                onClick={() => applyPreset(preset)}
                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <ol aria-label="Etapas do relatório" className="grid gap-2 sm:grid-cols-4">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              disabled={busy}
              aria-current={step === index ? "step" : undefined}
              onClick={() => void goTo(index)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${step === index ? "bg-blue-100 font-semibold text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 outline-none dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {stale ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          A amostra está desatualizada. Revise suas escolhas e visualize a prévia novamente.
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div ref={contentRef} tabIndex={-1} className="min-w-0 space-y-5 outline-none">
          {step === 0 ? (
            <ReportSourceStep
              sources={sources}
              sourceKeys={builder.areas.map((area) => area.source)}
              onSourceChange={changeArea}
              disabled={busy}
            />
          ) : null}
          {step === 1 ? (
            <>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Escolher campos
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                  Escolha o que deseja apresentar em cada área.
                </p>
              </div>
              {selected.map((area) =>
                area.catalog ? (
                  <ReportFieldsStep
                    key={area.source}
                    source={area.catalog}
                    fieldKeys={area.fields}
                    disabled={busy}
                    onFieldKeysChange={(fields) => {
                      const selectedFields = new Set(fields);
                      builder.setAreas((current) =>
                        current.map((item) =>
                          item.source === area.source
                            ? {
                                ...item,
                                fields,
                                aggregations: item.aggregations?.filter((aggregation) =>
                                  selectedFields.has(aggregation.field),
                                ),
                              }
                            : item,
                        ),
                      );
                      clearLoadedModel();
                      clearGeneratedResult();
                      setError("");
                      review.reset();
                    }}
                  />
                ) : (
                  <p
                    key={area.source}
                    role="status"
                    className="text-sm text-gray-600 dark:text-slate-300"
                  >
                    Uma área não está mais disponível. Remova-a do resumo para continuar.
                  </p>
                ),
              )}
            </>
          ) : null}
          {step === 2 ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Definir critérios
              </h2>
              {selected.map(({ catalog: areaCatalog, ...area }) =>
                areaCatalog ? (
                  <ReportCriteriaStep
                    key={area.source}
                    area={area}
                    source={areaCatalog}
                    onChange={updateArea}
                    disabled={busy}
                  />
                ) : null,
              )}
            </>
          ) : null}
          {step === 3 ? (
            <>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Revisar relatório
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                  Confira as áreas e os campos escolhidos. Cada área será apresentada separadamente.
                </p>
              </div>
              {selected.map((area) => (
                <section
                  key={area.source}
                  className="space-y-2 border-t border-gray-200 pt-4 dark:border-slate-700"
                >
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {area.catalog?.label || "Área indisponível"}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-300">
                    {area.catalog?.department_label || "Outras áreas"}
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-gray-800 dark:text-slate-200">
                    {area.fields.map((key) => (
                      <li key={key}>
                        {area.catalog?.fields.find((field) => field.key === key)?.label ||
                          "Campo indisponível"}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-gray-600 dark:text-slate-300">
                    {area.filters?.length
                      ? area.filterLogic === "or"
                        ? "Pelo menos um critério"
                        : "Todos os critérios"
                      : "Sem critérios: todos os registros autorizados"}
                  </p>
                  <ul className="space-y-1 text-sm text-gray-800 dark:text-slate-200">
                    {area.filters?.map((filter, index) => (
                      <li key={index}>
                        {area.catalog?.fields.find((field) => field.key === filter.field)?.label}{" "}
                        {operatorLabels[filter.operator]}{" "}
                        {Array.isArray(filter.value)
                          ? filter.value.join("; ")
                          : filter.value === "true" || filter.value === true
                            ? "Sim"
                            : filter.value === "false" || filter.value === false
                              ? "Não"
                              : String(filter.value)}
                      </li>
                    ))}
                    {area.catalog?.parameters?.map((parameter) => (
                      <li key={parameter.key}>
                        {parameter.label}:{" "}
                        {parameter.options?.find(
                          (option) => option.value === area.parameterValues?.[parameter.key],
                        )?.label ??
                          (parameter.type === "boolean" &&
                          area.parameterValues?.[parameter.key] !== undefined
                            ? String(area.parameterValues[parameter.key]) === "true"
                              ? "Sim"
                              : "Não"
                            : String(area.parameterValues?.[parameter.key] ?? "Não informado"))}
                      </li>
                    ))}
                    {area.groupBy?.map((key) => (
                      <li key={`group-${key}`}>
                        Agrupar por {area.catalog?.fields.find((field) => field.key === key)?.label}
                      </li>
                    ))}
                    {area.aggregations?.map((item) => (
                      <li key={`summary-${item.field}`}>
                        {summaryLabels[item.function]} de{" "}
                        {area.catalog?.fields.find((field) => field.key === item.field)?.label}
                      </li>
                    ))}
                    {area.orderBy?.map((item) => (
                      <li key={`sort-${item.field}`}>
                        Ordenar por{" "}
                        {area.catalog?.fields.find((field) => field.key === item.field)?.label}:{" "}
                        {item.direction === "asc" ? "crescente" : "decrescente"}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p role="status" className="text-sm text-gray-600 dark:text-slate-300">
                Configuração revisada. A prévia é opcional e temporária; não é necessária para a
                geração posterior.
              </p>
              {preview.data && !stale && !unavailable ? (
                <div aria-label="Prévia do relatório" className="space-y-6">
                  <p role="status" className="text-sm text-gray-600 dark:text-slate-300">
                    Prévia pronta. Cada área aparece em um bloco independente.
                  </p>
                  {preview.data.blocks.map((block) => (
                    <section
                      key={block.source}
                      aria-label={`Prévia de ${block.label}`}
                      className="min-w-0 space-y-2 border-t border-gray-200 pt-4 dark:border-slate-700"
                    >
                      <h3 className="font-semibold text-gray-900 dark:text-white">{block.label}</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-300">
                        {block.rows.length} {block.rows.length === 1 ? "registro" : "registros"} na
                        amostra
                        {block.hasMore ? ". Há mais registros disponíveis." : "."}
                      </p>
                      {block.rows.length ? (
                        <div
                          className="overflow-x-auto rounded border border-gray-200 dark:border-slate-700"
                          tabIndex={0}
                          role="region"
                          aria-label={`Dados de ${block.label}`}
                        >
                          <table className="w-full text-left text-sm text-gray-800 dark:text-slate-200">
                            <thead>
                              <tr>
                                {block.columns.map((column) => (
                                  <th
                                    key={column.key}
                                    scope="col"
                                    className="bg-gray-50 px-3 py-2 dark:bg-slate-800"
                                  >
                                    {column.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {block.rows.map((row, index) => (
                                <tr key={index}>
                                  {block.columns.map((column) => (
                                    <td
                                      key={column.key}
                                      className="border-t border-gray-200 px-3 py-2 dark:border-slate-700"
                                    >
                                      {typeof row[column.key] === "boolean"
                                        ? row[column.key]
                                          ? "Sim"
                                          : "Não"
                                        : row[column.key] == null
                                          ? "—"
                                          : String(row[column.key])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-slate-300">
                          Nenhum registro encontrado nesta área. Ajuste os critérios se necessário.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : null}
              {job.data ? (
                <section
                  aria-live="polite"
                  aria-label="Estado da geração"
                  className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {job.data.status === "completed"
                          ? "Relatório pronto"
                          : job.data.status === "failed"
                            ? "Não foi possível gerar o relatório"
                            : job.data.status === "cancelled"
                              ? "Geração cancelada"
                              : job.data.status === "expired"
                                ? "Resultado expirado"
                                : job.data.status === "queued"
                                  ? "Relatório aguardando na fila"
                                  : "Gerando relatório"}
                      </h3>
                      <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                        {job.data.status === "queued"
                          ? "A geração começará assim que houver capacidade disponível."
                          : job.data.status === "processing"
                            ? "Estamos consultando as áreas selecionadas."
                            : job.data.status === "completed"
                              ? "Cada área aparece em um bloco independente."
                              : job.data.error_message ?? "Tente novamente com os mesmos critérios."}
                      </p>
                    </div>
                    {job.data.status === "queued" || job.data.status === "processing" ? (
                      <Button type="button" variant="outline" onClick={() => void cancelGeneratedReport()}>
                        Cancelar geração
                      </Button>
                    ) : null}
                  </div>
                  {job.data.status === "completed" && snapshot.data ? (
                    <>
                      {snapshot.data.blocks ? (
                        <ReportResultBlocks blocks={snapshot.data.blocks} snapshot />
                      ) : (
                        <p role="status" className="text-sm text-gray-700 dark:text-slate-300">
                          Resultado legado carregado. Consulte o histórico para visualizar a tabela completa.
                        </p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-200 pt-4 dark:border-blue-900">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-gray-700 dark:text-slate-300">
                            {snapshot.data.blocks
                              ? "Resultado concluído. Escolha um formato para baixar as áreas separadamente."
                              : "Resultado concluído. Escolha um formato para baixar o relatório."}
                          </p>
                          <ReportDownloadActions id={snapshot.data.snapshot.id} />
                        </div>
                        {snapshot.data.blocks ? (
                          <Button type="button" variant="outline" onClick={() => setSaveDialogOpen(true)}>
                            Salvar para usar novamente
                          </Button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                  {job.data.status === "completed" && snapshot.isPending ? (
                    <p role="status" className="text-sm text-gray-700 dark:text-slate-300">
                      Carregando resultado...
                    </p>
                  ) : null}
                  {job.data.status === "completed" && snapshot.isError ? (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                      Não foi possível carregar o resultado. Tente novamente.
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
        <aside
          aria-label="Resumo da seleção"
          className="space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-slate-800 lg:sticky lg:top-4"
        >
          <h2 className="font-semibold text-gray-900 dark:text-white">Seu relatório</h2>
          <p className="text-sm text-gray-600 dark:text-slate-300" aria-live="polite">
            {builder.areas.length}{" "}
            {builder.areas.length === 1 ? "área selecionada" : "áreas selecionadas"}
          </p>
          <ol className="space-y-3 text-sm text-gray-800 dark:text-slate-200">
            {selected.map((area) => (
              <li key={area.source}>
                <div className="font-medium">{area.catalog?.label || "Área indisponível"}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 dark:text-slate-300">
                    {area.fields.length} {area.fields.length === 1 ? "campo" : "campos"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Remover ${area.catalog?.label || "área indisponível"}`}
                    onClick={() => changeArea(area.source)}
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white py-4 dark:border-slate-700 dark:bg-slate-900">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0 || busy}
          onClick={() => void goTo(step - 1)}
        >
          Anterior
        </Button>
        {step < 3 ? (
          <Button type="button" disabled={busy} onClick={() => void goTo(step + 1)}>
            {review.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Revisando...
              </>
            ) : (
              steps[step + 1]
            )}
          </Button>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy || unavailable} onClick={() => setSaveDialogOpen(true)}>
              Salvar como modelo
            </Button>
            <Button type="button" variant="outline" disabled={busy || unavailable} onClick={() => void showPreview()}>
              {preview.isPending ? "Carregando prévia..." : "Visualizar prévia"}
            </Button>
            <Button type="button" disabled={busy || unavailable} onClick={() => void generateReport()}>
              {createJob.isPending ? "Enfileirando..." : "Gerar relatório"}
            </Button>
          </div>
        )}
      </div>
      <Dialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        title="Salvar modelo"
        description="Dê um nome amigável ao modelo para reutilizá-lo depois."
        footer={null}
      >
        <form className="space-y-4" onSubmit={(event) => void saveModel(event)}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Nome
            <input
              name="name"
              required
              defaultValue={loadedModel?.name ?? "Meu relatório"}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-slate-900"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
            Descrição <span className="font-normal text-gray-500">(opcional)</span>
            <textarea
              name="description"
              maxLength={240}
              defaultValue={loadedModel?.description ?? ""}
              className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-slate-900"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSaveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createModel.isPending}>
              {createModel.isPending ? "Salvando..." : "Salvar modelo"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
