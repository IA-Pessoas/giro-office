import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { Dialog } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { fiscalMonthlyControlsQueryKey } from "../hooks/queryKeys";
import {
  fiscalControlService,
  type FiscalControlStatus,
  type FiscalMonthlyControl,
  type UpdateFiscalMonthlyControlPayload,
} from "../services/fiscalControlService";
import {
  competenceFromToday,
  FISCAL_CONTROL_STATUS_LABELS,
  fiscalControlStatusChange,
  formatCompetenceLabel,
  getFiscalErrorMessage,
} from "../utils";
import {
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
  isCompetence,
} from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

const STATUSES = Object.keys(FISCAL_CONTROL_STATUS_LABELS) as FiscalControlStatus[];
const REASON_MESSAGE = "Informe o motivo com pelo menos 3 caracteres.";

type Reopen = { control: FiscalMonthlyControl; status: FiscalControlStatus };

export function FiscalControlsSection({
  canEdit,
  canReopen,
}: {
  canEdit: boolean;
  canReopen: boolean;
}) {
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [statusFilter, setStatusFilter] = useState<FiscalControlStatus | "">("");
  const [openingForm, setOpeningForm] = useState(false);
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [openingReason, setOpeningReason] = useState("");
  const [reopen, setReopen] = useState<Reopen | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const validCompetence = isCompetence(competence);
  const list = useFetch(
    fiscalMonthlyControlsQueryKey(competence),
    () => fiscalControlService.list(competence),
    { enabled: validCompetence },
  );
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: fiscalMonthlyControlsQueryKey(competence) });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateFiscalMonthlyControlPayload }) =>
      fiscalControlService.update(id, payload),
    onSuccess: () => toast.success("Controle atualizado."),
    onError: (error) => toast.error(getFiscalErrorMessage(error)),
    // Sucesso ou conflito (409): a lista volta a refletir o banco.
    onSettled: refresh,
  });
  const open = useMutation({
    mutationFn: (payload: { client_id: string; competence: string; reason?: string }) =>
      fiscalControlService.open(payload),
    onSuccess: async (result) => {
      toast.success(result.created ? "Controle aberto." : "O cliente já tinha controle nesta competência.");
      setOpeningForm(false);
      setClient(null);
      setOpeningReason("");
      await refresh();
    },
    onError: (error) => toast.error(getFiscalErrorMessage(error)),
  });

  function changeStatus(control: FiscalMonthlyControl, status: FiscalControlStatus) {
    const change = fiscalControlStatusChange(control.status, status, canReopen);
    if (change === "direct") update.mutate({ id: control.id, payload: { status } });
    if (change === "reason") {
      setReopen({ control, status });
      setReopenReason("");
      setReopenError(null);
    }
  }

  async function confirmReopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reopen) return;
    const reason = reopenReason.trim();
    if (reason.length < 3) {
      setReopenError(REASON_MESSAGE);
      return;
    }
    try {
      await update.mutateAsync({ id: reopen.control.id, payload: { status: reopen.status, reason } });
      setReopen(null);
    } catch {
      // Toast já mostrou o motivo; o diálogo fica aberto para nova tentativa.
    }
  }

  function submitOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const reason = openingReason.trim();
    if (reason && reason.length < 3) {
      setOpeningError(REASON_MESSAGE);
      return;
    }
    setOpeningError(null);
    open.mutate({ client_id: client.id, competence, ...(reason ? { reason } : {}) });
  }

  const items = (list.data?.items ?? []).filter(
    (item) => !statusFilter || item.status === statusFilter,
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Controle mensal</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Um controle por cliente com Fiscal ativo na competência, gerado ao abrir a lista. Independe da receita do Simples e do checklist da Triagem.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Competência
          <input type="month" required value={competence} onChange={(event) => setCompetence(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Situação
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FiscalControlStatus | "")} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="">Todas</option>
            {STATUSES.map((status) => <option key={status} value={status}>{FISCAL_CONTROL_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        {canEdit && validCompetence ? (
          <button type="button" onClick={() => setOpeningForm((value) => !value)} aria-expanded={openingForm} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
            Abrir controle de cliente
          </button>
        ) : null}
      </div>

      {canEdit && openingForm ? (
        <form noValidate onSubmit={submitOpening} aria-label="Abrir controle de cliente" className="grid gap-4 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cliente sem Fiscal ativo em {formatCompetenceLabel(competence)} exige motivo: a abertura fica registrada como excepcional.
          </p>
          <ClientPickerModal filters={{}} selectedClient={client} onSelectClient={setClient} triggerLabel="Selecionar cliente" />
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Motivo da abertura excepcional
            <textarea rows={2} maxLength={500} value={openingReason} onChange={(event) => setOpeningReason(event.target.value)} aria-invalid={openingError ? true : undefined} aria-describedby={openingError ? "fiscal-control-opening-error" : undefined} className={FISCAL_TEXTAREA_CLASSNAME} />
            {openingError ? <span id="fiscal-control-opening-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{openingError}</span> : null}
          </label>
          <div>
            <button type="submit" disabled={!client || open.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>
              {open.isPending ? "Abrindo..." : "Abrir controle"}
            </button>
          </div>
        </form>
      ) : null}

      {list.isLoading ? (
        <div role="status">
          <FiscalStateBox icon={Loader2} tone="loading" title="Carregando controles" compact>
            Estamos gerando e consultando os controles da competência.
          </FiscalStateBox>
        </div>
      ) : null}
      {list.error ? (
        <div role="alert">
          <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar os controles" compact>
            {getFiscalErrorMessage(list.error)}
          </FiscalStateBox>
        </div>
      ) : null}
      {list.data && items.length === 0 ? (
        <FiscalStateBox icon={ClipboardList} title="Nenhum controle nesta competência" compact>
          {statusFilter ? "Nenhum controle com essa situação." : "Nenhum cliente com Fiscal ativo nesta competência."}
        </FiscalStateBox>
      ) : null}
      {items.length ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Controles fiscais de {formatCompetenceLabel(competence)}</caption>
            <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
              <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Regime</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Sem movimento</th><th className="px-4 py-3">Abertura</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item) => {
                const locked = item.status === "COMPLETED" && !canReopen;
                return (
                  <tr key={item.id} className="text-gray-800 dark:text-gray-200">
                    <td className="px-4 py-3">{item.client_name}</td>
                    <td className="px-4 py-3">{item.regime ?? "—"}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select
                          value={item.status}
                          disabled={locked || update.isPending}
                          title={locked ? "Reabrir controle concluído exige Fiscal nível 3." : undefined}
                          onChange={(event) => changeStatus(item, event.target.value as FiscalControlStatus)}
                          aria-label={`Situação de ${item.client_name}`}
                          className={`${FISCAL_FIELD_CONTROL_CLASSNAME} disabled:opacity-60`}
                        >
                          {STATUSES.map((status) => <option key={status} value={status}>{FISCAL_CONTROL_STATUS_LABELS[status]}</option>)}
                        </select>
                      ) : FISCAL_CONTROL_STATUS_LABELS[item.status]}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={item.no_movement}
                        disabled={!canEdit || update.isPending}
                        onChange={(event) => update.mutate({ id: item.id, payload: { no_movement: event.target.checked } })}
                        aria-label={`Sem movimento: ${item.client_name}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-3">{item.opening_reason ? <span title={item.opening_reason}>Excepcional: {item.opening_reason}</span> : "Automática"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={Boolean(reopen)}
        onOpenChange={(value) => { if (!value) setReopen(null); }}
        title="Reabrir controle concluído"
        description={reopen ? `${reopen.control.client_name}: Concluído → ${FISCAL_CONTROL_STATUS_LABELS[reopen.status]}. O motivo fica registrado na trilha.` : ""}
        preventClose={update.isPending}
        contentClassName="!w-[min(92vw,440px)]"
      >
        <form noValidate onSubmit={(event) => void confirmReopen(event)} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Motivo da reabertura
            <textarea rows={3} maxLength={500} autoFocus value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} aria-invalid={reopenError ? true : undefined} aria-describedby={reopenError ? "fiscal-control-reopen-error" : undefined} className={FISCAL_TEXTAREA_CLASSNAME} />
            {reopenError ? <span id="fiscal-control-reopen-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{reopenError}</span> : null}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReopen(null)} disabled={update.isPending} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">Cancelar</button>
            <button type="submit" disabled={update.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{update.isPending ? "Reabrindo..." : "Reabrir"}</button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
