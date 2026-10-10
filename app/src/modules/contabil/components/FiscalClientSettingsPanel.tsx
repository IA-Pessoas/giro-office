import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useTriageCatalogs } from "@modules/triagem";
import { useFetch } from "@shared/hooks";

import { TRIAGE_FISCAL_PORTFOLIO_QUERY_KEY, triageFiscalSettingsQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage, triageDocumentsService } from "../services";
import { CONTABIL_SELECT_CLASS } from "./ContabilCompetenceSelect";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";

/**
 * Prioridade Sim/Não e meio de envio do cliente no Fiscal. Valem para o cliente, não para a
 * competência: não confundir com urgência de solicitação nem com prioridade de item.
 */
export function FiscalClientSettingsPanel({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const settings = useFetch(triageFiscalSettingsQueryKey(clientId), () =>
    triageDocumentsService.getFiscalSettings(clientId),
  );
  // Valor do cliente não tem competência: opções do catálogo ativo da organização.
  const deliveryMethods = useTriageCatalogs("DELIVERY_METHOD");
  const [priority, setPriority] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setPriority(settings.data.priority === true);
    setDeliveryMethod(settings.data.delivery_method ?? "");
  }, [settings.data]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await triageDocumentsService.saveFiscalSettings(clientId, {
        priority,
        delivery_method: deliveryMethod || null,
      });
      await Promise.all([
        settings.refetch(),
        queryClient.invalidateQueries({ queryKey: TRIAGE_FISCAL_PORTFOLIO_QUERY_KEY }),
      ]);
      setMessage({ tone: "ok", text: "Prioridade e meio de envio salvos." });
    } catch (error) {
      setMessage({ tone: "error", text: getContabilErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset
      disabled={!canEdit || !settings.data || saving}
      className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"
    >
      <legend className="px-1 font-semibold text-gray-900 dark:text-white">
        Prioridade e meio de envio do cliente
      </legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600 dark:text-slate-300">
          Cliente prioritário
          <select
            aria-label="Cliente prioritário"
            value={priority ? "yes" : "no"}
            onChange={(event) => setPriority(event.target.value === "yes")}
            className={`mt-1 w-full ${CONTABIL_SELECT_CLASS}`}
          >
            <option value="no">Não</option>
            <option value="yes">Sim</option>
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-slate-300">
          Meio de envio
          <select
            aria-label="Meio de envio do cliente"
            value={deliveryMethod}
            onChange={(event) => setDeliveryMethod(event.target.value)}
            className={`mt-1 w-full ${CONTABIL_SELECT_CLASS}`}
          >
            <option value="">Não informado</option>
            {(deliveryMethods.data ?? []).map((item) => (
              <option key={item.id} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {settings.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {getContabilErrorMessage(settings.error)}
        </p>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={() => void save()}
          className={`mt-3 ${CONTABIL_OUTLINE_ACTION_CLASS}`}
        >
          Salvar prioridade e meio de envio
        </button>
      ) : null}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "mt-2 text-sm text-red-700 dark:text-red-300"
              : "mt-2 text-sm text-green-700 dark:text-green-300"
          }
        >
          {message.text}
        </p>
      ) : null}
    </fieldset>
  );
}
