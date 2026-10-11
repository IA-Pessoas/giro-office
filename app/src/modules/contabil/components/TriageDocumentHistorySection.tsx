import { useState } from "react";

import { useTriageDocumentHistory } from "../hooks";
import type { ContabilCompetence } from "../types";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilCompetenceSelect } from "./ContabilCompetenceSelect";
import { CONTABIL_HISTORY_PAGE_SIZE } from "./contabilHistory.helpers";
import { ContabilHistoryPanel } from "./ContabilHistoryPanel";
import {
  describeTriageHistoryEntry,
  formatTriageHistoryField,
  formatTriageHistoryValue,
} from "./triageDocumentHistory.helpers";

interface TriageDocumentHistorySectionProps {
  /** Sem cliente, lista as alterações recentes de toda a organização (só administrador). */
  clientId?: string;
  clientName?: string;
}

// Histórico documental da Triagem, lido da auditoria: documentos, justificativas, extratos,
// fechamento, Cloud e configuração, com todas as páginas (#1706).
export function TriageDocumentHistorySection({
  clientId,
  clientName,
}: TriageDocumentHistorySectionProps) {
  const [page, setPage] = useState(1);
  const [byCompetence, setByCompetence] = useState(false);
  const [competence, setCompetence] = useState<ContabilCompetence>(getCurrentContabilCompetence());
  const historyQuery = useTriageDocumentHistory({
    clientId,
    competence: byCompetence ? competence : undefined,
    page,
    pageSize: CONTABIL_HISTORY_PAGE_SIZE,
  });
  const scope = clientId ? (clientName ?? "Cliente selecionado") : "Todos os clientes";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-slate-300">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={byCompetence}
            onChange={(event) => {
              setByCompetence(event.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Filtrar o histórico por competência
        </label>
        {byCompetence ? (
          <ContabilCompetenceSelect
            label="Competência do histórico documental"
            value={competence}
            onChange={(value) => {
              setCompetence(value);
              setPage(1);
            }}
          />
        ) : null}
      </div>
      <ContabilHistoryPanel
        titleId="triage-document-history-title"
        title={clientId ? "Histórico documental" : "Alterações documentais recentes"}
        subtitle={`${scope} · ${byCompetence ? `Competência ${competence}` : "Todas as competências"}`}
        emptyMessage="Nenhuma alteração documental registrada."
        query={historyQuery}
        page={page}
        pageSize={CONTABIL_HISTORY_PAGE_SIZE}
        onPageChange={setPage}
        describeEntry={describeTriageHistoryEntry}
        formatField={formatTriageHistoryField}
        formatValue={formatTriageHistoryValue}
      />
    </div>
  );
}
