import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, FileText, Loader2 } from "lucide-react";

import { Button } from "@shared/ui/newLayout/button";

import { useReportBuilder } from "../hooks/useReportBuilder";
import { useReportPreview } from "../hooks/useReportPreview";
import { useReportsCatalog } from "../hooks/useReportsCatalog";
import {
  buildReportPreviewPayload,
  getSelectableReportFields,
  sanitizeReportPreviewResult,
} from "../utils/reportBuilder";
import { ReportFieldsStep } from "./ReportFieldsStep";
import { ReportFiltersStep } from "./ReportFiltersStep";
import { ReportOrganizationStep } from "./ReportOrganizationStep";
import { ReportPreviewStep } from "./ReportPreviewStep";
import { ReportRelationStep } from "./ReportRelationStep";
import { ReportSourceStep } from "./ReportSourceStep";

const steps = ["Fonte", "Relação", "Campos", "Filtros", "Organização", "Prévia"];

export function ReportsCatalogPage() {
  const catalogQuery = useReportsCatalog();
  const catalogItems = catalogQuery.data?.items ?? [];
  const builder = useReportBuilder();
  const preview = useReportPreview();
  const [activeStep, setActiveStep] = useState(0);
  const selectedSource = catalogItems.find((source) => source.key === builder.state.sourceKey);
  const canPreview = Boolean(
    selectedSource &&
      getSelectableReportFields(selectedSource).some((field) =>
        builder.state.fieldKeys.includes(field.key),
      ),
  );
  const safePreviewResult =
    preview.data && selectedSource
      ? sanitizeReportPreviewResult(preview.data, selectedSource)
      : undefined;

  function selectSource(sourceKey: string) {
    builder.reset(sourceKey);
    preview.reset();
    setActiveStep(0);
  }

  function goBackToCatalog() {
    builder.reset("");
    preview.reset();
    setActiveStep(0);
  }

  function generatePreview() {
    if (!selectedSource) return;
    const payload = buildReportPreviewPayload(builder.state, selectedSource);
    if (payload) preview.mutate(payload);
  }

  function renderBuilderStep() {
    if (!selectedSource) return null;

    switch (activeStep) {
      case 0:
        return (
          <ReportSourceStep
            sources={catalogItems}
            sourceKey={builder.state.sourceKey}
            onSourceChange={selectSource}
          />
        );
      case 1:
        return (
          <ReportRelationStep
            source={selectedSource}
            relation={builder.state.relation}
            onRelationChange={(relation) => builder.update("relation", relation)}
          />
        );
      case 2:
        return (
          <ReportFieldsStep
            source={selectedSource}
            fieldKeys={builder.state.fieldKeys}
            onFieldKeysChange={(fieldKeys) => builder.update("fieldKeys", fieldKeys)}
          />
        );
      case 3:
        return (
          <ReportFiltersStep
            source={selectedSource}
            filters={builder.state.filters}
            filterLogic={builder.state.filterLogic}
            onFiltersChange={(filters) => builder.update("filters", filters)}
            onFilterLogicChange={(filterLogic) => builder.update("filterLogic", filterLogic)}
          />
        );
      case 4:
        return (
          <ReportOrganizationStep
            source={selectedSource}
            state={builder.state}
            onStateChange={builder.setState}
          />
        );
      case 5:
        return (
          <ReportPreviewStep
            result={safePreviewResult}
            error={preview.error}
            isPending={preview.isPending}
            canPreview={canPreview}
            onPreview={generatePreview}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          Relatórios
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Consulte fontes autorizadas para montar relatórios.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
        <nav aria-label="Abas de relatórios">
          <div role="tablist" className="flex min-w-max items-center gap-1">
            <button
              aria-controls="reports-catalog-panel"
              aria-selected="true"
              className="inline-flex items-center rounded-lg bg-blue-100 px-5 py-2.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              id="reports-tab-catalog"
              role="tab"
              tabIndex={0}
              type="button"
            >
              Catálogo
            </button>
          </div>
        </nav>
      </section>

      <section
        aria-labelledby="reports-tab-catalog"
        className="rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
        id="reports-catalog-panel"
        role="tabpanel"
      >
        {catalogQuery.isPending ? (
          <div
            aria-live="polite"
            className="flex items-center gap-3 text-sm text-gray-600 dark:text-slate-400"
            role="status"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Carregando fontes de relatório...
          </div>
        ) : catalogQuery.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {catalogQuery.error.message}
          </p>
        ) : selectedSource ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Construir relatório</p>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  {selectedSource.label}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={goBackToCatalog}>
                <ArrowLeft aria-hidden="true" /> Voltar ao catálogo
              </Button>
            </div>
            <ol
              className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6"
              aria-label="Etapas do construtor"
            >
              {steps.map((step, index) => (
                <li key={step}>
                  <button
                    type="button"
                    aria-current={activeStep === index ? "step" : undefined}
                    onClick={() => setActiveStep(index)}
                    className={`w-full rounded-md px-2 py-2 text-left text-xs font-medium transition ${
                      activeStep === index
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                        : "text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="mr-1">{index + 1}.</span>
                    {step}
                  </button>
                </li>
              ))}
            </ol>
            {renderBuilderStep()}
            <div className="flex items-center justify-between border-t border-gray-200 pt-5 dark:border-slate-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
                disabled={activeStep <= 0}
              >
                <ArrowLeft aria-hidden="true" /> Anterior
              </Button>
              {activeStep < steps.length - 1 ? (
                <Button
                  type="button"
                  onClick={() =>
                    setActiveStep((step) => Math.min(steps.length - 1, step + 1))
                  }
                >
                  Próxima <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <span className="text-sm text-gray-500 dark:text-slate-500">
                  Prévia segura, sem criação de job.
                </span>
              )}
            </div>
          </div>
        ) : catalogItems.length === 0 ? (
          <div
            className="flex max-w-2xl items-start gap-3 text-sm text-gray-600 dark:text-slate-400"
            role="status"
          >
            <BookOpen
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300"
            />
            <p>
              Nenhuma fonte de relatório está disponível no seu perfil. As fontes aparecem aqui
              quando você tem acesso a dados reportáveis.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Escolha uma fonte</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                O construtor usará apenas descritores e capacidades publicados pelo catálogo.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalogItems.map((source) => (
                <li
                  key={source.key}
                  className="rounded-lg border border-gray-200 p-4 dark:border-slate-700"
                >
                  <p className="font-medium text-gray-900 dark:text-white">{source.label}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                    {source.module}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => selectSource(source.key)}
                  >
                    Construir relatório <ArrowRight aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
