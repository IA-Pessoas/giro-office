import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@shared/ui/newLayout/button";
import { useReportBuilder } from "../hooks/useReportBuilder";
import { useReportsCatalog } from "../hooks/useReportsCatalog";
import { reportsCatalogQueryKey } from "../hooks/queryKeys";
import { reportsService } from "../services/reportsService";
import { getSelectableReportFields } from "../utils/reportBuilder";
import { ReportFieldsStep } from "./ReportFieldsStep";
import { ReportSourceStep } from "./ReportSourceStep";
import { getErrorStatus } from "./reportUi";

const steps = ["Escolher áreas", "Escolher campos", "Revisar relatório"];

export function ReportsCreatePanel() {
  const catalog = useReportsCatalog();
  const builder = useReportBuilder();
  const queryClient = useQueryClient();
  const review = useMutation({ mutationFn: reportsService.validateDefinition });
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (step > 0) contentRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const sources = catalog.data?.items ?? [];
  const selected = builder.areas.map((area) => ({
    ...area,
    catalog: sources.find((source) => source.key === area.source),
  }));
  const unavailable = selected.some(
    (area) =>
      !area.catalog ||
      area.fields.some(
        (key) => !getSelectableReportFields(area.catalog!).some((field) => field.key === key),
      ),
  );
  const empty = selected.filter((area) => area.fields.length === 0);

  function changeArea(source: string) {
    if (review.isPending) return;
    builder.toggleArea(source);
    setError("");
    review.reset();
    if (step === 2) setStep(1);
  }
  async function goTo(target: number) {
    if (review.isPending) return;
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
    try {
      await review.mutateAsync({ version: 2, areas: builder.areas });
      setStep(2);
    } catch (cause) {
      const status = getErrorStatus(cause);
      setError(
        status === 403
          ? "Seu acesso mudou. Confira as áreas e os campos disponíveis e tente novamente."
          : status === 400
            ? "Não foi possível revisar essas escolhas. Confira os campos ou reduza a quantidade de áreas e tente novamente."
            : "Não foi possível revisar o relatório. Tente novamente.",
      );
      if (status === 403)
        await queryClient.invalidateQueries({ queryKey: reportsCatalogQueryKey() });
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
      <ol aria-label="Etapas do relatório" className="grid gap-2 sm:grid-cols-3">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              disabled={review.isPending}
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div ref={contentRef} tabIndex={-1} className="min-w-0 space-y-5 outline-none">
          {step === 0 ? (
            <ReportSourceStep
              sources={sources}
              sourceKeys={builder.areas.map((area) => area.source)}
              onSourceChange={changeArea}
              disabled={review.isPending}
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
                    disabled={review.isPending}
                    onFieldKeysChange={(fields) => {
                      builder.setAreas((current) =>
                        current.map((item) =>
                          item.source === area.source ? { ...item, fields } : item,
                        ),
                      );
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
                </section>
              ))}
              <p role="status" className="text-sm text-gray-600 dark:text-slate-300">
                Áreas e campos revisados. Você pode voltar para ajustar suas escolhas.
              </p>
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
                    disabled={review.isPending}
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0 || review.isPending}
          onClick={() => void goTo(step - 1)}
        >
          Anterior
        </Button>
        {step < 2 ? (
          <Button type="button" disabled={review.isPending} onClick={() => void goTo(step + 1)}>
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
          <Button type="button" variant="outline" onClick={() => void goTo(0)}>
            Ajustar áreas
          </Button>
        )}
      </div>
    </div>
  );
}