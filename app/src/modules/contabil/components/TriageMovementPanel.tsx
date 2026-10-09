import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";

import { triageMonthlyQueryKey } from "../hooks/queryKeys";
import { getContabilErrorMessage, triageDocumentsService } from "../services";
import type {
  ContabilCompetence,
  TriageDocumentField,
  TriageDocumentsMonthly,
  TriageMonthlyUpdate,
} from "../types";
import { CONTABIL_DOCUMENTS } from "./triageDocumentLabels";

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800";
const BUTTON_CLASS =
  "rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700 disabled:opacity-60 dark:border-blue-800 dark:text-blue-200";

type MonthlyDraft = {
  triad_moviment: boolean;
  notes: string;
  justification: string;
  responsible_id: string;
  download_date: string;
  settlement_date: string;
};

function monthlyDraft(record: TriageDocumentsMonthly | null | undefined): MonthlyDraft {
  return {
    triad_moviment: record?.triad_moviment ?? false,
    notes: record?.notes ?? "",
    justification: record?.justification ?? "",
    responsible_id: record?.responsible_id ?? "",
    download_date: record?.download_date?.slice(0, 10) ?? "",
    settlement_date: record?.settlement_date?.slice(0, 10) ?? "",
  };
}

/**
 * Movimento padrão do cliente (itens que entram em cada competência) e dados do movimento
 * do mês. A competência já aberta usa o padrão congelado nela; mudar o padrão vale para as
 * próximas.
 */
export function TriageMovementPanel({
  clientId,
  competence,
  canEdit,
  record,
  justifications,
}: {
  clientId: string;
  competence: ContabilCompetence;
  canEdit: boolean;
  record: TriageDocumentsMonthly | null | undefined;
  justifications: { id: string; code: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const config = useFetch(["triagem", "movement-config", clientId], () =>
    triageDocumentsService.getMovementConfig(clientId),
  );
  const users = useAssignableUsers({ module: "contabil", enabled: Boolean(record) });
  const [activeItems, setActiveItems] = useState<TriageDocumentField[]>([]);
  const [draft, setDraft] = useState<MonthlyDraft>(() => monthlyDraft(record));
  const [saving, setSaving] = useState<"" | "config" | "monthly">("");
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (config.data) setActiveItems(config.data.active_items ?? []);
  }, [config.data]);
  useEffect(() => {
    setDraft(monthlyDraft(record));
  }, [record]);

  async function run(kind: "config" | "monthly", action: () => Promise<unknown>, ok: string) {
    setSaving(kind);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "ok", text: ok });
    } catch (error) {
      setMessage({ tone: "error", text: getContabilErrorMessage(error) });
    } finally {
      setSaving("");
    }
  }

  function saveConfig() {
    return run(
      "config",
      async () => {
        await triageDocumentsService.saveMovementConfig(clientId, activeItems);
        await config.refetch();
      },
      "Movimento padrão salvo. Vale para as competências iniciadas a partir de agora.",
    );
  }

  function saveMonthly() {
    if (!record) return;
    const data: TriageMonthlyUpdate = {
      triad_moviment: draft.triad_moviment,
      notes: draft.notes || null,
      justification: draft.justification || null,
      responsible_id: draft.responsible_id || null,
      download_date: draft.download_date || null,
      settlement_date: draft.settlement_date || null,
    };
    return run(
      "monthly",
      async () => {
        await triageDocumentsService.updateMonthly(record.id, data);
        await queryClient.invalidateQueries({
          queryKey: triageMonthlyQueryKey(clientId, competence, "CONTABIL"),
        });
      },
      "Movimento do mês salvo.",
    );
  }

  const update = <K extends keyof MonthlyDraft>(key: K, value: MonthlyDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
      <fieldset disabled={!canEdit || config.isLoading || saving !== ""}>
        <legend className="font-semibold text-gray-900 dark:text-white">
          Movimento padrão do cliente
        </legend>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Itens marcados entram pendentes em cada nova competência; os demais ficam desativados.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONTABIL_DOCUMENTS.map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                aria-label={`Movimento padrão: ${label}`}
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
        {canEdit ? (
          <button type="button" onClick={() => void saveConfig()} className={`mt-3 ${BUTTON_CLASS}`}>
            Salvar movimento padrão
          </button>
        ) : null}
      </fieldset>
      {record ? (
        <fieldset
          disabled={!canEdit || saving !== ""}
          className="border-t border-gray-200 pt-4 dark:border-slate-700"
        >
          <legend className="sr-only">Movimento do mês</legend>
          <h3 className="font-semibold text-gray-900 dark:text-white">Movimento do mês</h3>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={draft.triad_moviment}
              onChange={(event) => update("triad_moviment", event.target.checked)}
            />
            Movimento enviado
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-slate-300">
              Responsável
              <select
                value={draft.responsible_id}
                onChange={(event) => update("responsible_id", event.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Sem responsável</option>
                {(users.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600 dark:text-slate-300">
              Justificativa
              <select
                value={draft.justification}
                onChange={(event) => update("justification", event.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Não definida</option>
                {justifications.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600 dark:text-slate-300">
              Data de download
              <input
                type="date"
                value={draft.download_date}
                onChange={(event) => update("download_date", event.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-slate-300">
              Data de baixa
              <input
                type="date"
                value={draft.settlement_date}
                onChange={(event) => update("settlement_date", event.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-slate-300 sm:col-span-2">
              Observação
              <textarea
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                rows={2}
                maxLength={2000}
                className={FIELD_CLASS}
              />
            </label>
          </div>
          {canEdit ? (
            <button type="button" onClick={() => void saveMonthly()} className={`mt-3 ${BUTTON_CLASS}`}>
              Salvar movimento do mês
            </button>
          ) : null}
        </fieldset>
      ) : null}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={
            message.tone === "error"
              ? "text-sm text-red-700 dark:text-red-300"
              : "text-sm text-green-700 dark:text-green-300"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
