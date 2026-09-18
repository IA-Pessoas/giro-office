import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";

import {
  useApplyPessoalGroupAssignmentPreviewMutation,
  useCreatePessoalGroupAssignmentPreviewMutation,
  usePessoalEligibleGroupAssignments,
  usePessoalGroupAssignmentPreview,
} from "../hooks/usePessoalGroupAssignments";
import { usePessoalGroups } from "../hooks/usePessoalGroups";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalPrimaryButtonClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";

interface PessoalGroupAssignmentSectionProps {
  canEdit: boolean;
}

const PAGE_SIZE = 25;

function outcomeLabel(outcome: string, reason: string | null): string {
  if (outcome === "CHANGED") return "Alterar";
  if (outcome === "NO_OP") return "Sem mudança";
  return reason ?? "Ignorado";
}

export function PessoalGroupAssignmentSection({ canEdit }: PessoalGroupAssignmentSectionProps) {
  const [page, setPage] = useState(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [groupId, setGroupId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const groupsQuery = usePessoalGroups();
  const eligibleQuery = usePessoalEligibleGroupAssignments({ page, limit: PAGE_SIZE });
  const previewQuery = usePessoalGroupAssignmentPreview(previewId, previewPage);
  const createPreviewMutation = useCreatePessoalGroupAssignmentPreviewMutation();
  const applyMutation = useApplyPessoalGroupAssignmentPreviewMutation();
  const preview = previewQuery.data ?? createPreviewMutation.data;
  const groups = (groupsQuery.data ?? []).filter((group) => !group.archived_at);
  const eligible = eligibleQuery.data;
  const busy = createPreviewMutation.isPending || applyMutation.isPending;

  function clearPreview() {
    idempotencyKeyRef.current = null;
    createPreviewMutation.reset();
    setPreviewId(null);
    setPreviewPage(1);
    setSuccessMessage(null);
  }

  function toggleClient(clientId: string) {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
    clearPreview();
  }

  async function createPreview() {
    if (!groupId || selectedClientIds.size === 0) {
      setErrorMessage("Escolha um grupo e ao menos uma folha elegível.");
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const nextPreview = await createPreviewMutation.mutateAsync({
        groupId,
        clientIds: [...selectedClientIds],
      });
      idempotencyKeyRef.current = crypto.randomUUID();
      setPreviewId(nextPreview.preview_id);
      setPreviewPage(1);
    } catch (error) {
      setErrorMessage(getPessoalErrorMessage(error, "Não foi possível gerar a prévia."));
    }
  }

  async function applyPreview() {
    if (!preview || !canEdit || !idempotencyKeyRef.current) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await applyMutation.mutateAsync({
        previewId: preview.preview_id,
        fingerprint: preview.fingerprint,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setSuccessMessage(
        `${result.changed} folha(s) atualizada(s), ${result.no_op} sem mudança e ${result.skipped} ignorada(s).`,
      );
    } catch (error) {
      setErrorMessage(getPessoalErrorMessage(error, "A prévia expirou ou não pôde ser aplicada."));
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Atribuição de grupos em lote</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Selecione folhas elegíveis, revise a prévia persistida e aplique somente o resultado revisado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void eligibleQuery.refetch()}
            disabled={eligibleQuery.isFetching}
            className={pessoalSecondaryButtonClassName}
          >
            {eligibleQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            Grupo de destino
            <select value={groupId} onChange={(event) => { setGroupId(event.target.value); clearPreview(); }} disabled={!canEdit || busy} className={pessoalTextFieldClassName}>
              <option value="">Selecione um grupo</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          {canEdit ? (
            <button type="button" onClick={() => void createPreview()} disabled={busy || selectedClientIds.size === 0 || !groupId} className={pessoalPrimaryButtonClassName}>
              {createPreviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Gerar prévia ({selectedClientIds.size})
            </button>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-700 dark:bg-gray-700/50 dark:text-gray-300">
              <tr><th className="w-12 px-4 py-3">Selecionar</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Grupo atual</th></tr>
            </thead>
            <tbody>
              {(eligible?.data ?? []).map((item) => (
                <tr key={item.client_id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-3"><input aria-label={`Selecionar ${item.client_name}`} type="checkbox" checked={selectedClientIds.has(item.client_id)} onChange={() => toggleClient(item.client_id)} disabled={!canEdit || busy} /></td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.client_name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.group_name ?? "Sem grupo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {eligibleQuery.isLoading ? <p className="p-4 text-sm text-gray-600 dark:text-gray-300">Carregando folhas elegíveis...</p> : null}
          {eligibleQuery.isError ? <p role="alert" className="p-4 text-sm text-red-600 dark:text-red-300">{getPessoalErrorMessage(eligibleQuery.error, "Não foi possível listar folhas elegíveis.")}</p> : null}
          {!eligibleQuery.isLoading && !eligibleQuery.isError && eligible?.data.length === 0 ? <p className="p-4 text-sm text-gray-600 dark:text-gray-300">Nenhuma folha elegível encontrada.</p> : null}
        </div>
        {eligible ? <Pagination page={page} hasMore={eligible.hasMore} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => current + 1)} /> : null}
      </div>

      {preview ? (
        <div aria-label="Prévia de atribuição em lote" className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-950 dark:text-blue-100">Prévia para {preview.target_group.name}</h3>
              <p className="mt-1 text-sm text-blue-900/80 dark:text-blue-200">Expira em aproximadamente {Math.ceil(preview.ttl_seconds / 60)} minuto(s). A aplicação não aceita seleção alterada.</p>
            </div>
            {canEdit && !successMessage ? <button type="button" onClick={() => void applyPreview()} disabled={busy || preview.ttl_seconds === 0} className={pessoalPrimaryButtonClassName}>{applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Aplicar prévia</button> : null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric label="Alterar" value={preview.totals.changed} /><Metric label="Sem mudança" value={preview.totals.no_op} /><Metric label="Ignorados" value={preview.totals.skipped} /><Metric label="Selecionados" value={preview.totals.requested} /></dl>
          <div className="mt-5 overflow-x-auto rounded-xl border border-blue-200 bg-white dark:border-blue-900/50 dark:bg-gray-900">
            <table className="w-full min-w-[640px] text-sm"><thead className="bg-blue-50 text-left text-xs font-semibold uppercase text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Grupo anterior</th><th className="px-4 py-3">Resultado</th></tr></thead><tbody>{preview.details.data.map((detail) => <tr key={detail.client_id} className="border-t border-gray-100 dark:border-gray-700"><td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{detail.client_name ?? detail.client_id}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-300">{detail.previous_group_name ?? "Sem grupo"}</td><td className="px-4 py-3 text-gray-600 dark:text-gray-300">{outcomeLabel(detail.outcome, detail.skip_reason)}</td></tr>)}</tbody></table>
          </div>
          <Pagination page={previewPage} hasMore={preview.details.hasMore} onPrevious={() => setPreviewPage((current) => Math.max(1, current - 1))} onNext={() => setPreviewPage((current) => current + 1)} />
        </div>
      ) : null}
      {errorMessage ? <p role="alert" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300"><AlertCircle className="h-4 w-4" />{errorMessage}</p> : null}
      {successMessage ? <p role="status" className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300"><CheckCircle2 className="h-4 w-4" />{successMessage}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 dark:border-blue-900/50 dark:bg-gray-900"><dt className="text-xs text-gray-600 dark:text-gray-300">{label}</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{value}</dd></div>;
}

function Pagination({ page, hasMore, onPrevious, onNext }: { page: number; hasMore: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-300"><span>Página {page}</span><button type="button" onClick={onPrevious} disabled={page === 1} className={pessoalSecondaryButtonClassName}>Anterior</button><button type="button" onClick={onNext} disabled={!hasMore} className={pessoalSecondaryButtonClassName}>Próxima</button></div>;
}
