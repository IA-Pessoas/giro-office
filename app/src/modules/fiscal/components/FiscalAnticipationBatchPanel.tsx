import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers } from "@modules/rh";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { fiscalAnticipationsQueryKey } from "../hooks/queryKeys";
import {
  type FiscalAnticipationItem,
  fiscalAnticipationService,
} from "../services/fiscalAnticipationService";
import {
  buildAnticipationItemChanges,
  downloadFile,
  FISCAL_ANTICIPATION_CLASSIFICATION_LABELS,
  FISCAL_ANTICIPATION_FIELD_LABELS,
  FISCAL_ANTICIPATION_ISSUE_LABELS,
  FISCAL_ANTICIPATION_STATUS_LABELS,
  formatAnticipationHistoryField,
  formatAnticipationHistoryValue,
  formatAnticipationSummary,
  formatCompetenceLabel,
  formatMoney,
  getFiscalErrorMessage,
} from "../utils";
import type {
  FiscalAnticipationClassification,
  FiscalAnticipationCorrectableField,
  FiscalAnticipationItemChanges,
} from "../utils/fiscalAnticipation";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
} from "./fiscalFieldStyles";

const LABEL_CLASSNAME = "grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300";
const LINK_BUTTON_CLASSNAME = "text-blue-700 hover:underline dark:text-blue-300";
const CLASSIFICATIONS = Object.entries(FISCAL_ANTICIPATION_CLASSIFICATION_LABELS) as Array<
  [FiscalAnticipationClassification, string]
>;
const FIELDS = Object.entries(FISCAL_ANTICIPATION_FIELD_LABELS) as Array<
  [FiscalAnticipationCorrectableField, string]
>;
const MONEY_FIELDS = new Set<FiscalAnticipationCorrectableField>(["value", "ipi", "icms_st"]);

/** Valor do XML e, se houver, a correção da revisão: "R$ 9,90 (XML R$ 10,00)". */
function CorrectedValue({
  item,
  field,
}: {
  item: FiscalAnticipationItem;
  field: FiscalAnticipationCorrectableField;
}) {
  const format = (value: string | null) =>
    MONEY_FIELDS.has(field) ? formatMoney(value) : (value ?? "—") || "—";
  const corrected = item.corrections[field];
  if (corrected === undefined) return <>{format(item[field])}</>;
  return (
    <>
      <span className="font-medium text-blue-800 dark:text-blue-300">{format(corrected)}</span>
      <span className="block text-xs text-gray-500 dark:text-gray-400">XML {format(item[field])}</span>
    </>
  );
}

function ItemReviewForm({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: FiscalAnticipationItem;
  pending: boolean;
  onCancel: () => void;
  onSave: (changes: FiscalAnticipationItemChanges, reason: string) => Promise<void>;
}) {
  const [classification, setClassification] = useState<FiscalAnticipationClassification | "">(
    item.classification ?? "",
  );
  const [manualValue, setManualValue] = useState(item.manual_value ?? "");
  const [corrections, setCorrections] = useState(() =>
    Object.fromEntries(FIELDS.map(([field]) => [field, item.corrections[field] ?? ""])),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const changes = buildAnticipationItemChanges(item, {
      classification,
      manual_value: manualValue,
      corrections,
    });
    if (!changes) {
      setError("Nada foi alterado.");
      return;
    }
    if (!reason.trim()) {
      setError("Informe o motivo da alteração.");
      return;
    }
    try {
      await onSave(changes, reason.trim());
    } catch (saveError) {
      setError(getFiscalErrorMessage(saveError));
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-label={`Revisar item ${item.item_number} da NF ${item.note_number}`}
      className="grid gap-3 bg-gray-50 p-3 md:grid-cols-4 dark:bg-slate-800/60"
    >
      <label className={LABEL_CLASSNAME}>
        Classificação
        <select value={classification} onChange={(event) => setClassification(event.target.value as FiscalAnticipationClassification | "")} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
          <option value="">Sem classificação</option>
          {CLASSIFICATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={LABEL_CLASSNAME}>
        Valor informado manualmente
        <input type="text" inputMode="decimal" value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="Ex.: 1.234,56" className={FISCAL_FIELD_CONTROL_CLASSNAME} />
      </label>
      {FIELDS.map(([field, label]) => (
        <label key={field} className={LABEL_CLASSNAME}>
          {label} corrigido
          <input type="text" value={corrections[field] ?? ""} onChange={(event) => setCorrections((current) => ({ ...current, [field]: event.target.value }))} placeholder={`XML: ${item[field] ?? "—"}`} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
        </label>
      ))}
      <label className={`${LABEL_CLASSNAME} md:col-span-4`}>
        Motivo
        <textarea required rows={2} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} className={FISCAL_TEXTAREA_CLASSNAME} />
      </label>
      <p className="text-xs text-gray-600 md:col-span-4 dark:text-gray-400">Deixe um campo corrigido vazio para voltar ao valor do XML.</p>
      {error ? <p role="alert" className={`${FISCAL_FIELD_ERROR_CLASSNAME} md:col-span-4`}>{error}</p> : null}
      <div className="flex gap-2 md:col-span-4">
        <button type="submit" disabled={pending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{pending ? "Salvando..." : "Salvar revisão"}</button>
        <button type="button" onClick={onCancel} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>Cancelar</button>
      </div>
    </form>
  );
}

export function FiscalAnticipationBatchPanel({
  batchId,
  clientId,
  canEdit,
  canAuthorize,
}: {
  batchId: string;
  clientId: string;
  canEdit: boolean;
  /** Fiscal nível 3: conclui a conferência no lugar do conferente. */
  canAuthorize: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const users = useAssignableUsers({ module: "fiscal" });
  const userName = (id: string) => users.data?.find((candidate) => candidate.id === id)?.name;
  const displayName = (id: string) =>
    users.isLoading ? "carregando..." : (userName(id) ?? "Usuário sem acesso atual");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [reviewerId, setReviewerId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  const detail = useFetch(
    [...fiscalAnticipationsQueryKey(clientId), "detail", batchId],
    () => fiscalAnticipationService.detail(batchId),
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: fiscalAnticipationsQueryKey(clientId) });
  const updateItem = useMutation({ mutationFn: fiscalAnticipationService.updateItem, onSuccess: refresh });
  const submit = useMutation({ mutationFn: fiscalAnticipationService.submit, onSuccess: refresh });
  const check = useMutation({ mutationFn: fiscalAnticipationService.check, onSuccess: refresh });

  async function run(action: () => Promise<unknown>, success: string) {
    setActionError(null);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      setActionError(getFiscalErrorMessage(error));
    }
  }

  async function download(format: "csv" | "pdf") {
    setActionError(null);
    setDownloading(format);
    try {
      const blob = await fiscalAnticipationService.download(batchId, format);
      downloadFile(blob, `antecipacoes-${detail.data?.competence ?? ""}-${batchId}.${format}`);
    } catch (error) {
      setActionError(getFiscalErrorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  const batch = detail.data;
  if (detail.isLoading) return <p role="status" className="text-sm text-gray-600 dark:text-gray-400">Carregando itens...</p>;
  if (detail.error) return <p role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{getFiscalErrorMessage(detail.error)}</p>;
  if (!batch) return null;

  const editable = canEdit && batch.status === "pending_review";
  const unclassified = batch.items.filter((item) => item.classification === null).length;
  const canCheck = canAuthorize || (Boolean(user?.id) && user?.id === batch.reviewer_id);
  const history = batch.history;

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          {batch.file_name} · {formatCompetenceLabel(batch.competence)} · {FISCAL_ANTICIPATION_STATUS_LABELS[batch.status]}
        </h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">{formatAnticipationSummary(batch)}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Responsável: {displayName(batch.responsible_id)} · Conferente: {batch.reviewer_id ? displayName(batch.reviewer_id) : "não designado"}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300">Classificação e valores são manuais: nenhum imposto é calculado.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void download("csv")} disabled={downloading !== null} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
          {downloading === "csv" ? "Exportando..." : "Exportar CSV"}
        </button>
        <button type="button" onClick={() => void download("pdf")} disabled={downloading !== null} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
          {downloading === "pdf" ? "Exportando..." : "Exportar PDF"}
        </button>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Demonstrativo manual{batch.status === "checked" ? "" : " (lote ainda não conferido)"}: mostra a origem de cada valor (XML, corrigido ou informado) e não é apuração de imposto nem guia oficial.
        </p>
      </div>

      {batch.issues.length ? (
        <div role="alert" className="overflow-x-auto rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
          <table className="w-full text-left text-sm text-amber-900 dark:text-amber-200">
            <caption className="px-4 pt-3 text-left font-medium">Arquivos e itens fora do lote</caption>
            <thead><tr><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Arquivo</th><th className="px-4 py-2">Motivo</th></tr></thead>
            <tbody>
              {batch.issues.map((issue, index) => (
                <tr key={`${issue.entry}-${index}`}>
                  <td className="px-4 py-2">{FISCAL_ANTICIPATION_ISSUE_LABELS[issue.kind]}</td>
                  <td className="px-4 py-2">{issue.entry}</td>
                  <td className="px-4 py-2">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Itens do lote de antecipações</caption>
          <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
            <tr><th className="px-3 py-2">Nota / item</th><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Classificação</th><th className="px-3 py-2">NCM</th><th className="px-3 py-2">CFOP</th><th className="px-3 py-2">Qtd.</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">IPI</th><th className="px-3 py-2">ICMS ST</th><th className="px-3 py-2">Valor manual</th><th className="px-3 py-2">Origem</th>{editable ? <th className="px-3 py-2">Ações</th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {batch.items.flatMap((item) => [
              <tr key={item.id} className="align-top text-gray-800 dark:text-gray-200">
                <td className="px-3 py-2 whitespace-nowrap">NF {item.note_number} · item {item.item_number}</td>
                <td className="px-3 py-2">{item.description || item.code}</td>
                <td className="px-3 py-2">{item.classification ? FISCAL_ANTICIPATION_CLASSIFICATION_LABELS[item.classification] : <span className="text-amber-700 dark:text-amber-300">Pendente</span>}</td>
                {FIELDS.map(([field]) => (
                  <td key={field} className="px-3 py-2"><CorrectedValue item={item} field={field} /></td>
                ))}
                <td className="px-3 py-2">{formatMoney(item.manual_value)}</td>
                <td className="px-3 py-2"><span className="block">{item.entry}</span><span className="block font-mono text-xs text-gray-500 dark:text-gray-400">{item.access_key}</span></td>
                {editable ? (
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setEditingItem(editingItem === item.id ? null : item.id)} aria-expanded={editingItem === item.id} aria-label={`Revisar item ${item.item_number} da NF ${item.note_number}`} className={LINK_BUTTON_CLASSNAME}>
                      Revisar
                    </button>
                  </td>
                ) : null}
              </tr>,
              editable && editingItem === item.id ? (
                <tr key={`${item.id}-review`}>
                  <td colSpan={12} className="p-0">
                    <ItemReviewForm
                      item={item}
                      pending={updateItem.isPending}
                      onCancel={() => setEditingItem(null)}
                      onSave={async (changes, reason) => {
                        await updateItem.mutateAsync({ batchId: batch.id, itemId: item.id, changes, reason });
                        toast.success("Item revisado.");
                        setEditingItem(null);
                      }}
                    />
                  </td>
                </tr>
              ) : null,
            ])}
          </tbody>
        </table>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
          <label className={LABEL_CLASSNAME}>
            Conferente
            <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
              <option value="">{batch.reviewer_id ? `Manter ${displayName(batch.reviewer_id)}` : "Selecione"}</option>
              {users.data?.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={submit.isPending || unclassified > 0 || !(reviewerId || batch.reviewer_id)}
            onClick={() => void run(() => submit.mutateAsync({ batchId: batch.id, reviewerId: reviewerId || (batch.reviewer_id ?? "") }), "Lote enviado à conferência.")}
            className={FISCAL_PRIMARY_BUTTON_CLASSNAME}
          >
            Enviar à conferência
          </button>
          {unclassified > 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">{unclassified} item(ns) sem classificação.</p> : null}
        </div>
      ) : null}

      {canEdit && batch.status === "awaiting_check" ? (
        canCheck ? (
          <div className="grid gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
            <label className={LABEL_CLASSNAME}>
              Motivo da devolução (obrigatório para devolver)
              <textarea rows={2} maxLength={2000} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} className={FISCAL_TEXTAREA_CLASSNAME} />
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={check.isPending} onClick={() => void run(() => check.mutateAsync({ batchId: batch.id, decision: "approve" }), "Lote conferido.")} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
                Aprovar conferência
              </button>
              <button
                type="button"
                disabled={check.isPending || !returnReason.trim()}
                onClick={() => void run(async () => { await check.mutateAsync({ batchId: batch.id, decision: "return", reason: returnReason.trim() }); setReturnReason(""); }, "Lote devolvido para classificação.")}
                className={FISCAL_SECONDARY_BUTTON_CLASSNAME}
              >
                Devolver
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">Aguardando a conferência de {batch.reviewer_id ? displayName(batch.reviewer_id) : "conferente"}.</p>
        )
      ) : null}

      {actionError ? <p role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{actionError}</p> : null}

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Histórico da revisão</h5>
        {history.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">Sem alterações registradas.</p> : null}
        <ul className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
          {history.map((entry) => {
            const item = entry.item_id ? batch.items.find((candidate) => candidate.id === entry.item_id) : undefined;
            return (
              <li key={entry.id}>
                {new Date(entry.created_at).toLocaleString("pt-BR")} · {userName(entry.actor_user_id) ?? "Usuário"} · {item ? `NF ${item.note_number} item ${item.item_number} · ` : ""}{formatAnticipationHistoryField(entry.field)}: {formatAnticipationHistoryValue(entry.field, entry.previous_value, userName)} → {formatAnticipationHistoryValue(entry.field, entry.new_value, userName)}{entry.reason ? ` · Motivo: ${entry.reason}` : ""}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
