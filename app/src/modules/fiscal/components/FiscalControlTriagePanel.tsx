import { FISCAL_DOCUMENTS, STATUSES } from "@modules/contabil/components/TriageDocumentsSection";
import { useFetch } from "@shared/hooks";
import { AlertCircle, Loader2 } from "lucide-react";

import { fiscalControlTriageQueryKey } from "../hooks/queryKeys";
import { fiscalControlService } from "../services/fiscalControlService";
import { formatTriagePending, getFiscalErrorMessage } from "../utils";
import { FiscalStateBox } from "./FiscalStateBox";

const FIELD_LABELS = new Map<string, string>(FISCAL_DOCUMENTS);
const STATUS_LABELS = new Map<string, string>(STATUSES);

/** Documentos da Triagem do cliente na competência. Só consulta: editar é na Triagem. */
export function FiscalControlTriagePanel({
  controlId,
  clientName,
}: {
  controlId: string;
  clientName: string;
}) {
  const triage = useFetch(fiscalControlTriageQueryKey(controlId), () =>
    fiscalControlService.triage(controlId),
  );

  if (triage.isLoading) {
    return (
      <div role="status">
        <FiscalStateBox icon={Loader2} tone="loading" title="Carregando documentos da Triagem" compact>
          Consultando a Triagem de {clientName}.
        </FiscalStateBox>
      </div>
    );
  }
  if (triage.error || !triage.data) {
    return (
      <div role="alert">
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível consultar a Triagem" compact>
          {getFiscalErrorMessage(triage.error)}
        </FiscalStateBox>
      </div>
    );
  }

  const { source, pending, items } = triage.data;
  return (
    <section aria-label={`Documentos da Triagem de ${clientName}`} className="mb-4 space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        Documentos da Triagem: {formatTriagePending(pending)}
        {source === "PLANNED" ? " (rotina mensal ainda não iniciada)" : ""}
      </p>
      {source === "NONE" ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A Triagem não tem registro desta competência. Concluir o controle exige Fiscal nível 3 e justificativa.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.field} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:text-gray-300">
              {FIELD_LABELS.get(item.field) ?? item.field}: {STATUS_LABELS.get(item.status) ?? item.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
