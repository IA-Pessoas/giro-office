import { useEffect, useState } from "react";

import { useFetch } from "@shared/hooks";

import { triageFiscalSpecialConfigQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage, triageDocumentsService } from "../services";
import type { TriageFiscalSpecialConfig } from "../types";
import { CONTABIL_OUTLINE_ACTION_CLASS } from "./contabilUiClasses";
import { FISCAL_CONFIGURABLE_DOCUMENTS } from "./triageDocumentLabels";

/**
 * Documentos fiscais especiais aplicáveis ao cliente. Os marcados entram pendentes nas
 * competências abertas a partir de agora; os demais ficam não aplicáveis.
 */
export function FiscalSpecialDocumentsPanel({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const config = useFetch(triageFiscalSpecialConfigQueryKey(clientId), () =>
    triageDocumentsService.getFiscalSpecialConfig(clientId),
  );
  const [activeItems, setActiveItems] = useState<TriageFiscalSpecialConfig["active_items"]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (config.data) setActiveItems(config.data.active_items ?? []);
  }, [config.data]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await triageDocumentsService.saveFiscalSpecialConfig(clientId, activeItems);
      await config.refetch();
      setMessage({
        tone: "ok",
        text: "Documentos especiais salvos. Valem para as competências abertas a partir de agora.",
      });
    } catch (error) {
      setMessage({ tone: "error", text: getContabilErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset
      disabled={!canEdit || !config.data || saving}
      className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"
    >
      <legend className="px-1 font-semibold text-gray-900 dark:text-white">
        Documentos especiais aplicáveis
      </legend>
      <p className="text-sm text-gray-600 dark:text-slate-400">
        Marcados entram em cada nova competência (documentos pendentes, faturamento a
        informar); os demais ficam não aplicáveis.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {FISCAL_CONFIGURABLE_DOCUMENTS.map(([field, label]) => (
          <label
            key={field}
            className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300"
          >
            <input
              type="checkbox"
              aria-label={`Documento especial: ${label}`}
              checked={activeItems.includes(field)}
              onChange={(event) =>
                setActiveItems((current) =>
                  event.target.checked
                    ? [...current, field]
                    : current.filter((item) => item !== field),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {config.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {getContabilErrorMessage(config.error)}
        </p>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          onClick={() => void save()}
          className={`mt-3 ${CONTABIL_OUTLINE_ACTION_CLASS}`}
        >
          Salvar documentos especiais
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
