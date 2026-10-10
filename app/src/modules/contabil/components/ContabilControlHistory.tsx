import { useState } from "react";

import { useContabilControlHistory } from "../hooks";
import type { ContabilCompetence } from "../types";
import { getContabilControlFieldLabel } from "./contabilControlFields";
import {
  CONTABIL_HISTORY_PAGE_SIZE,
  formatContabilControlHistoryValue,
} from "./contabilHistory.helpers";
import { ContabilHistoryPanel } from "./ContabilHistoryPanel";

interface ContabilControlHistoryProps {
  clientId: string;
  clientName?: string;
  competence: ContabilCompetence;
}

export function ContabilControlHistory({
  clientId,
  clientName,
  competence,
}: ContabilControlHistoryProps) {
  const [page, setPage] = useState(1);
  const historyQuery = useContabilControlHistory({
    clientId,
    competence,
    page,
    pageSize: CONTABIL_HISTORY_PAGE_SIZE,
  });

  return (
    <ContabilHistoryPanel
      titleId="contabil-control-history-title"
      subtitle={`${clientName ? `${clientName} · ` : ""}Competência ${competence}`}
      emptyMessage="Nenhuma alteração registrada nesta competência."
      query={historyQuery}
      page={page}
      pageSize={CONTABIL_HISTORY_PAGE_SIZE}
      onPageChange={setPage}
      formatField={getContabilControlFieldLabel}
      formatValue={formatContabilControlHistoryValue}
    />
  );
}
