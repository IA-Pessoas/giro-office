import { Loader2 } from "lucide-react";

import { useClient } from "../hooks/useClients";
import type { ClientPickerOption } from "./ClientPickerModal";

interface ClientSelectionFieldProps {
  client?: ClientPickerOption | null;
  clientId?: string | null;
}

export function ClientSelectionField({ client, clientId }: ClientSelectionFieldProps) {
  const resolvedClientId = client?.id ?? clientId ?? undefined;
  const clientQuery = useClient(resolvedClientId);
  const clientName =
    client?.name ?? clientQuery.data?.company_name ?? clientQuery.data?.name ?? null;
  const clientDocument = client?.document ?? clientQuery.data?.cpf_cnpj ?? null;

  return (
    <div
      aria-live="polite"
      className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-slate-800 dark:text-slate-200"
    >
      {clientQuery.isLoading && !clientName ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {clientName ?? (clientQuery.isLoading ? "Carregando cliente..." : "Nenhum cliente selecionado")}
        </span>
        {clientDocument ? (
          <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{clientDocument}</span>
        ) : null}
      </span>
    </div>
  );
}
