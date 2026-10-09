import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";

import { fiscalWholesaleQueryKey } from "../hooks/queryKeys";
import { fiscalWholesaleService } from "../services/fiscalWholesaleService";
import { getFiscalErrorMessage } from "../utils";
import { FISCAL_PRIMARY_BUTTON_CLASSNAME } from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

const wholesaleLabel = (value: boolean) => (value ? "Atacadista" : "Não atacadista");

export function FiscalWholesaleSection({ canEdit }: { canEdit: boolean }) {
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const queryClient = useQueryClient();
  const clientId = client?.id ?? "";
  const users = useAssignableUsers({ enabled: Boolean(client), module: "fiscal" });
  const userName = (id: string) => users.data?.find((user) => user.id === id)?.name ?? "Usuário";
  const state = useFetch(fiscalWholesaleQueryKey(clientId), () => fiscalWholesaleService.get(clientId), {
    enabled: Boolean(client),
  });
  const save = useMutation({
    mutationFn: (value: boolean) => fiscalWholesaleService.set(clientId, value),
    onSuccess: async (data) => {
      toast.success(data.is_wholesale ? "Cliente marcado como atacadista." : "Marcação de atacadista removida.");
      await queryClient.invalidateQueries({ queryKey: fiscalWholesaleQueryKey(clientId) });
    },
  });

  async function toggle(value: boolean) {
    try {
      await save.mutateAsync(value);
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cliente atacadista</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Marcação informativa para a análise de antecipações. Não dispara nenhum cálculo; cada alteração fica no histórico com quem alterou e quando.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</p>
        <ClientPickerModal filters={{}} selectedClient={client} onSelectClient={setClient} triggerLabel="Selecionar cliente" />
      </div>

      {client ? (
        <div className="space-y-4">
          {state.isLoading ? (
            <div role="status">
              <FiscalStateBox icon={Loader2} tone="loading" title="Carregando condição do cliente" compact>
                Estamos consultando a marcação de atacadista.
              </FiscalStateBox>
            </div>
          ) : null}
          {state.error ? (
            <div role="alert">
              <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a condição" compact>
                {getFiscalErrorMessage(state.error)}
              </FiscalStateBox>
            </div>
          ) : null}
          {state.data ? (
            <>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                <p className="text-sm text-gray-800 dark:text-gray-200">
                  Situação atual: <strong>{wholesaleLabel(state.data.is_wholesale)}</strong>
                </p>
                {canEdit ? (
                  <button type="button" disabled={save.isPending} onClick={() => void toggle(!state.data.is_wholesale)} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
                    {save.isPending ? "Salvando..." : state.data.is_wholesale ? "Remover marcação de atacadista" : "Marcar como atacadista"}
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Histórico</h3>
                {state.data.history.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma alteração registrada; o cliente nunca foi marcado como atacadista.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
                    {state.data.history.map((entry) => (
                      <li key={`${entry.created_at}-${entry.new_value}`}>
                        {new Date(entry.created_at).toLocaleString("pt-BR")} · {userName(entry.actor_user_id)}: {wholesaleLabel(entry.previous_value)} → {wholesaleLabel(entry.new_value)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um cliente para consultar ou alterar a marcação.</p>}
    </section>
  );
}
