import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { Dialog } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";
import { type FormEvent, Fragment, useState } from "react";

import { fiscalMonthlyControlsQueryKey } from "../hooks/queryKeys";
import {
  fiscalControlService,
  monthlyItemSource,
  type FiscalControlStatus,
  type FiscalMonthlyControl,
  type UpdateFiscalMonthlyControlPayload,
} from "../services/fiscalControlService";
import {
  competenceFromToday,
  FISCAL_CONTROL_STATUS_LABELS,
  fiscalControlStatusChange,
  formatCompetenceLabel,
  formatTriagePending,
  matchesResponsible,
  getFiscalErrorMessage,
} from "../utils";
import type { FiscalResponsibleFilter } from "../utils/fiscalControl";
import {
  FISCAL_CANCEL_BUTTON_CLASSNAME,
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_SECONDARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
  isCompetence,
} from "./fiscalFieldStyles";
import { FiscalControlObligationsPanel } from "./FiscalControlObligationsPanel";
import { FiscalControlTransferDialog } from "./FiscalControlTransferDialog";
import { FiscalControlTriagePanel } from "./FiscalControlTriagePanel";
import { FiscalStateBox } from "./FiscalStateBox";

const STATUSES = Object.keys(FISCAL_CONTROL_STATUS_LABELS) as FiscalControlStatus[];
const REASON_MESSAGE = "Informe o motivo com pelo menos 3 caracteres.";

/** Mudança que pede motivo e nível 3: reabrir ou concluir com pendência na Triagem. */
const AUTHORIZATION_COPY = {
  reopen: {
    title: "Reabrir controle concluído",
    label: "Motivo da reabertura",
    submit: "Reabrir",
    forbidden: "Reabrir controle concluído exige Fiscal nível 3.",
  },
  complete: {
    title: "Concluir com pendência na Triagem",
    label: "Justificativa da conclusão",
    submit: "Concluir",
    forbidden: "Há documentos pendentes na Triagem: concluir exige Fiscal nível 3 e justificativa.",
  },
} as const;

type Authorization = {
  control: FiscalMonthlyControl;
  status: FiscalControlStatus;
  kind: "reopen" | "complete";
};

export function FiscalControlsSection({
  canEdit,
  canAuthorize,
}: {
  canEdit: boolean;
  canAuthorize: boolean;
}) {
  const [competence, setCompetence] = useState(() => competenceFromToday(-1));
  const [statusFilter, setStatusFilter] = useState<FiscalControlStatus | "">("");
  const [responsibleFilter, setResponsibleFilter] = useState<FiscalResponsibleFilter>({
    userId: "",
    basis: "competence",
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [transferOpen, setTransferOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState(false);
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [openingReason, setOpeningReason] = useState("");
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [authorizationReason, setAuthorizationReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
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
    const change = fiscalControlStatusChange(
      control.status,
      status,
      canAuthorize,
      control.triage_pending,
    );
    const kind = control.status === "COMPLETED" ? "reopen" : "complete";
    if (change === "direct") update.mutate({ id: control.id, payload: { status } });
    if (change === "forbidden") {
      toast.error(AUTHORIZATION_COPY[kind].forbidden);
    }
    if (change === "reason") {
      setAuthorization({ control, status, kind });
      setAuthorizationReason("");
      setAuthorizationError(null);
    }
  }

  async function confirmAuthorization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authorization) return;
    const reason = authorizationReason.trim();
    if (reason.length < 3) {
      setAuthorizationError(REASON_MESSAGE);
      return;
    }
    try {
      await update.mutateAsync({ id: authorization.control.id, payload: { status: authorization.status, reason } });
      setAuthorization(null);
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

  const allItems = list.data?.items ?? [];
  const items = allItems.filter(
    (item) =>
      (!statusFilter || item.status === statusFilter) &&
      matchesResponsible(item, responsibleFilter),
  );
  // Quem aparece como responsável (da competência ou atual) vira opção do filtro.
  const responsibleOptions = [
    ...new Map(
      allItems.flatMap((item) => [
        ...(item.responsible_id ? [[item.responsible_id, item.responsible_name ?? "—"] as const] : []),
        ...(item.default_responsible_id
          ? [[item.default_responsible_id, item.default_responsible_name ?? "—"] as const]
          : []),
      ]),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const selectedIds = items.filter((item) => selected.has(item.id)).map((item) => item.id);

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

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
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Responsável
          <select value={responsibleFilter.userId} onChange={(event) => setResponsibleFilter((value) => ({ ...value, userId: event.target.value }))} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="">Todos</option>
            <option value="none">Sem responsável</option>
            {responsibleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Carteira
          <select value={responsibleFilter.basis} onChange={(event) => setResponsibleFilter((value) => ({ ...value, basis: event.target.value as FiscalResponsibleFilter["basis"] }))} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="competence">Desta competência</option>
            <option value="current">Atual do cliente</option>
          </select>
        </label>
        {canAuthorize && selectedIds.length ? (
          <button type="button" onClick={() => setTransferOpen(true)} className={FISCAL_SECONDARY_BUTTON_CLASSNAME}>
            Transferir selecionados ({selectedIds.length})
          </button>
        ) : null}
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
              <tr>{canAuthorize ? <th className="px-4 py-3"><span className="sr-only">Selecionar para transferir</span></th> : null}<th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Regime</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Sem movimento</th><th className="px-4 py-3">Abertura</th><th className="px-4 py-3">Triagem</th><th className="px-4 py-3">Obrigações</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item) => {
                const locked = item.status === "COMPLETED" && !canAuthorize;
                const expanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                  <tr className="text-gray-800 dark:text-gray-200">
                    {canAuthorize ? (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(item.id)} disabled={item.status === "COMPLETED"} title={item.status === "COMPLETED" ? "Controle concluído não é transferido." : undefined} onChange={(event) => toggleSelected(item.id, event.target.checked)} aria-label={`Selecionar ${item.client_name} para transferir`} className="h-4 w-4" />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">{item.client_name}</td>
                    <td className="px-4 py-3">{item.regime ?? "—"}</td>
                    <td className="px-4 py-3">
                      {item.responsible_name ?? "Sem responsável"}
                      {item.default_responsible_id !== item.responsible_id ? (
                        <span className="block text-xs text-gray-500 dark:text-gray-400">Carteira atual: {item.default_responsible_name ?? "sem responsável"}</span>
                      ) : null}
                    </td>
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
                        disabled={!canEdit || item.status === "COMPLETED" || update.isPending}
                        title={item.status === "COMPLETED" ? "Controle concluído: reabra para alterar o movimento." : undefined}
                        onChange={(event) => update.mutate({ id: item.id, payload: { no_movement: event.target.checked } })}
                        aria-label={`Sem movimento: ${item.client_name}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-3">{item.opening_reason ? <span title={item.opening_reason}>Excepcional: {item.opening_reason}</span> : "Automática"}</td>
                    <td className="px-4 py-3">{formatTriagePending(item.triage_pending)}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} aria-expanded={expanded} aria-controls={`fiscal-obligations-${item.id}`} className="text-blue-700 hover:underline dark:text-blue-300">
                        {item.pending_obligations === 1 ? "1 pendente" : `${item.pending_obligations} pendentes`}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={`fiscal-obligations-${item.id}`}>
                      <td colSpan={canAuthorize ? 9 : 8} className="bg-gray-50 px-4 py-3 dark:bg-slate-800/50">
                        <FiscalControlTriagePanel controlId={item.id} clientName={item.client_name} />
                        <FiscalControlObligationsPanel source={monthlyItemSource(item.id)} clientName={item.client_name} canEdit={canEdit} locked={item.status === "COMPLETED"} />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={Boolean(authorization)}
        onOpenChange={(value) => { if (!value) setAuthorization(null); }}
        title={AUTHORIZATION_COPY[authorization?.kind ?? "reopen"].title}
        description={
          authorization?.kind === "complete"
            ? `${authorization.control.client_name}: ${formatTriagePending(authorization.control.triage_pending).toLowerCase()} na Triagem. A conclusão fica registrada como excepcional, com a sua justificativa; a Triagem não muda.`
            : authorization
              ? `${authorization.control.client_name}: Concluído → ${FISCAL_CONTROL_STATUS_LABELS[authorization.status]}. O motivo fica registrado na trilha.`
              : ""
        }
        preventClose={update.isPending}
        contentClassName="!w-[min(92vw,440px)]"
      >
        <form noValidate onSubmit={(event) => void confirmAuthorization(event)} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            {AUTHORIZATION_COPY[authorization?.kind ?? "reopen"].label}
            <textarea rows={3} maxLength={500} autoFocus value={authorizationReason} onChange={(event) => setAuthorizationReason(event.target.value)} aria-invalid={authorizationError ? true : undefined} aria-describedby={authorizationError ? "fiscal-control-authorization-error" : undefined} className={FISCAL_TEXTAREA_CLASSNAME} />
            {authorizationError ? <span id="fiscal-control-authorization-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{authorizationError}</span> : null}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAuthorization(null)} disabled={update.isPending} className={FISCAL_CANCEL_BUTTON_CLASSNAME}>Cancelar</button>
            <button type="submit" disabled={update.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{update.isPending ? "Salvando..." : AUTHORIZATION_COPY[authorization?.kind ?? "reopen"].submit}</button>
          </div>
        </form>
      </Dialog>
      <FiscalControlTransferDialog
        controlIds={selectedIds}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransferred={() => {
          setSelected(new Set());
          void refresh();
        }}
      />
    </section>
  );
}
