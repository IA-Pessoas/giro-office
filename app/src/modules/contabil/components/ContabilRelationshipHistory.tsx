import { useState } from "react";

import { useContabilRelationshipHistory } from "../hooks";
import { CONTABIL_CONTROL_HISTORY_PAGE_SIZE } from "./contabilControlHistory.helpers";
import { ContabilHistoryPanel } from "./ContabilHistoryPanel";
import { formatContabilRelationshipHistoryValue } from "./contabilPartySection.helpers";
import { getContabilRelationshipFieldLabel } from "./contabilRelationshipFields";

export function ContabilRelationshipHistory({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string;
}) {
  const [page, setPage] = useState(1);
  const historyQuery = useContabilRelationshipHistory({
    clientId,
    page,
    pageSize: CONTABIL_CONTROL_HISTORY_PAGE_SIZE,
  });

  return (
    <ContabilHistoryPanel
      titleId="contabil-relationship-history-title"
      subtitle={clientName ? `${clientName} · Relação Contábil` : "Relação Contábil"}
      emptyMessage="Nenhuma alteração registrada na Relação Contábil."
      query={historyQuery}
      page={page}
      pageSize={CONTABIL_CONTROL_HISTORY_PAGE_SIZE}
      onPageChange={setPage}
      formatField={getContabilRelationshipFieldLabel}
      formatValue={formatContabilRelationshipHistoryValue}
    />
  );
}
