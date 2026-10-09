import { useState } from "react";
import { Download, Printer } from "lucide-react";

import { Dialog } from "@shared/components";

import type { AiUsageControl, AiUsageReport } from "../services/marketingAiUsageService";
import {
  AI_USAGE_REPORT_COLUMNS,
  aiUsageReportRows,
  createAiUsageReportCsv,
  downloadCsvFile,
  formatCompetence,
} from "../utils/marketingCsv";
import { printMarketingReport } from "../utils/printMarketingReport";
import { marketingPrimaryButtonClass, marketingSecondaryButtonClass } from "./marketingButtonStyles";
import { MarketingReportTable } from "./MarketingReportTable";

// Os dois relatórios do legado: `conhecimento=0` e `integracao=1`.
const REPORT_SECTIONS = [
  { key: "unanswered", title: "Sem resposta de conhecimento", file: "sem-resposta" },
  { key: "withoutIntegration", title: "Sem integração", file: "sem-integracao" },
] as const satisfies ReadonlyArray<{ key: keyof AiUsageReport; title: string; file: string }>;

function CsvButton({ label, controls, competence, file }: {
  label: string;
  controls: AiUsageControl[];
  competence: string;
  file: string;
}) {
  return (
    <button
      className={marketingSecondaryButtonClass}
      disabled={controls.length === 0}
      onClick={() =>
        downloadCsvFile(`controle-ia-${file}-${competence}.csv`, createAiUsageReportCsv(controls, competence))
      }
      type="button"
    >
      <Download aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
      CSV {label.toLowerCase()}
    </button>
  );
}

/** Relatório imprimível/CSV da competência; usa a mesma resposta exibida na tela. */
export function MarketingAiUsageReport({
  competence,
  report,
}: {
  competence: string;
  report: AiUsageReport | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={marketingSecondaryButtonClass}
        disabled={!report}
        onClick={() => setOpen(true)}
        type="button"
      >
        Abrir relatório imprimível
      </button>
      <Dialog
        contentClassName="w-[min(96vw,900px)]"
        description="Controles de IA da competência selecionada"
        onOpenChange={setOpen}
        open={open && Boolean(report)}
        title="Relatório de controle de IA"
      >
        {report ? (
          <article
            aria-label={`Controle de IA de ${formatCompetence(competence)}`}
            className="marketing-print-report space-y-6 text-gray-900 dark:text-slate-100"
            id="marketing-ai-usage-report"
          >
            <div className="hide-on-print flex flex-wrap justify-end gap-2">
              {REPORT_SECTIONS.map((section) => (
                <CsvButton
                  competence={competence}
                  controls={report[section.key]}
                  file={section.file}
                  key={section.key}
                  label={section.title}
                />
              ))}
              <button
                className={marketingPrimaryButtonClass}
                onClick={() => printMarketingReport("marketing-ai-usage-report")}
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Imprimir relatório
              </button>
            </div>

            <header className="border-b border-gray-200 pb-4 dark:border-slate-700">
              <p className="text-sm text-gray-600 dark:text-slate-300">Relatório de controle de IA</p>
              <h2 className="text-xl font-semibold">Competência {formatCompetence(competence)}</h2>
            </header>

            {REPORT_SECTIONS.map((section) => (
              <MarketingReportTable
                columns={AI_USAGE_REPORT_COLUMNS}
                emptyMessage="Nenhum usuário nesta situação."
                ids={report[section.key].map((control) => control.id)}
                key={section.key}
                rows={aiUsageReportRows(report[section.key], competence)}
                title={section.title}
              />
            ))}
          </article>
        ) : null}
      </Dialog>
    </>
  );
}
