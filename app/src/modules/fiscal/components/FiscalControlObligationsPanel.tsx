import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  FISCAL_MONTHLY_CONTROLS_QUERY_KEY,
  fiscalMonthlyObligationsQueryKey,
} from "../hooks/queryKeys";
import {
  fiscalControlService,
  type FiscalMonthlyObligation,
  type FiscalObligationCode,
  type UpdateFiscalObligationPayload,
} from "../services/fiscalControlService";
import {
  fiscalObligationActions,
  formatFiscalDateLabel,
  getFiscalErrorMessage,
  todayInputDate,
} from "../utils";
import {
  FISCAL_CANCEL_BUTTON_CLASSNAME,
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
} from "./fiscalFieldStyles";
import { FiscalStateBox } from "./FiscalStateBox";

const REASON_MESSAGE = "Informe o motivo com pelo menos 3 caracteres.";
const LINK_BUTTON_CLASSNAME = "text-sm text-blue-700 hover:underline dark:text-blue-300";

type Action = { code: FiscalObligationCode; kind: "complete" | "dispense" | "undo" };

function statusLabel(item: FiscalMonthlyObligation): string {
  if (item.status === "NOT_APPLICABLE") return `Não aplicável: ${item.not_applicable_reason ?? ""}`;
  if (item.status === "COMPLETED") {
    const protocol = item.protocol ? ` · protocolo ${item.protocol}` : "";
    return `Cumprida em ${formatFiscalDateLabel(item.completed_on)}${protocol}`;
  }
  return "Pendente";
}

export function FiscalControlObligationsPanel({
  controlId,
  clientName,
  canEdit,
  locked,
}: {
  controlId: string;
  clientName: string;
  canEdit: boolean;
  locked: boolean;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [date, setDate] = useState(todayInputDate);
  const [protocol, setProtocol] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [addCode, setAddCode] = useState<FiscalObligationCode | "">("");
  const [addReason, setAddReason] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const queryKey = fiscalMonthlyObligationsQueryKey(controlId);
  const list = useFetch(queryKey, () => fiscalControlService.listObligations(controlId));
  const editable = canEdit && !locked;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    // Pendências da carteira mudam junto.
    await queryClient.invalidateQueries({ queryKey: FISCAL_MONTHLY_CONTROLS_QUERY_KEY });
  };
  const update = useMutation({
    mutationFn: ({ code, payload }: { code: FiscalObligationCode; payload: UpdateFiscalObligationPayload }) =>
      fiscalControlService.updateObligation(controlId, code, payload),
    onSuccess: () => {
      toast.success("Obrigação atualizada.");
      setAction(null);
    },
    onError: (error) => toast.error(getFiscalErrorMessage(error)),
    onSettled: refresh,
  });
  const add = useMutation({
    mutationFn: (payload: { code: FiscalObligationCode; reason?: string }) =>
      fiscalControlService.addObligation(controlId, payload),
    onSuccess: () => {
      toast.success("Obrigação incluída.");
      setAddCode("");
      setAddReason("");
    },
    onError: (error) => toast.error(getFiscalErrorMessage(error)),
    onSettled: refresh,
  });

  function start(next: Action) {
    setAction(next);
    setDate(todayInputDate());
    setProtocol("");
    setReason("");
    setReasonError(null);
  }

  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const trimmed = reason.trim();
    if (action.kind === "dispense" && trimmed.length < 3) {
      setReasonError(REASON_MESSAGE);
      return;
    }
    const payload: UpdateFiscalObligationPayload =
      action.kind === "complete"
        ? { completed_on: date, ...(protocol.trim() ? { protocol: protocol.trim() } : {}) }
        : action.kind === "dispense"
          ? { applicable: false, reason: trimmed }
          : { completed_on: null, ...(trimmed ? { reason: trimmed } : {}) };
    update.mutate({ code: action.code, payload });
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const definition = list.data?.addable.find((item) => item.code === addCode);
    if (!definition) return;
    const trimmed = addReason.trim();
    if ((definition.conditional || trimmed) && trimmed.length < 3) {
      setAddError(definition.conditional ? `${definition.name} é condicional: ${REASON_MESSAGE}` : REASON_MESSAGE);
      return;
    }
    setAddError(null);
    add.mutate({ code: definition.code, ...(trimmed ? { reason: trimmed } : {}) });
  }

  if (list.isLoading) {
    return (
      <div role="status">
        <FiscalStateBox icon={Loader2} tone="loading" title="Carregando obrigações" compact>
          Consultando as obrigações de {clientName}.
        </FiscalStateBox>
      </div>
    );
  }
  if (list.error || !list.data) {
    return (
      <div role="alert">
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar as obrigações" compact>
          {getFiscalErrorMessage(list.error)}
        </FiscalStateBox>
      </div>
    );
  }

  return (
    <section aria-label={`Obrigações de ${clientName}`} className="space-y-3">
      {locked ? <p className="text-sm text-gray-600 dark:text-gray-400">Controle concluído: reabra para alterar as obrigações.</p> : null}
      {list.data.items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma obrigação sugerida para o regime registrado neste controle. Inclua abaixo as que se aplicam.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-slate-700 dark:border-slate-700">
          {list.data.items.map((item) => (
            <li key={item.code} className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.name}{" "}
                    <a href={item.source} target="_blank" rel="noreferrer" className={LINK_BUTTON_CLASSNAME}>fonte oficial</a>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{item.note}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{statusLabel(item)}</p>
                </div>
                <div className="flex gap-3">
                  {fiscalObligationActions(item.status, editable).map((kind) =>
                    kind === "restore" ? (
                      <button key={kind} type="button" disabled={update.isPending} onClick={() => update.mutate({ code: item.code, payload: { applicable: true } })} className={LINK_BUTTON_CLASSNAME}>Tornar aplicável</button>
                    ) : (
                      <button key={kind} type="button" onClick={() => start({ code: item.code, kind })} className={LINK_BUTTON_CLASSNAME}>
                        {kind === "complete" ? "Cumprir" : kind === "dispense" ? "Não aplicável" : "Desfazer cumprimento"}
                      </button>
                    ),
                  )}
                </div>
              </div>
              {action?.code === item.code ? (
                <form noValidate onSubmit={submitAction} aria-label={`${item.name}: registrar`} className="flex flex-wrap items-end gap-3">
                  {action.kind === "complete" ? (
                    <>
                      <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Cumprida em
                        <input type="date" required max={todayInputDate()} value={date} onChange={(event) => setDate(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
                      </label>
                      <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Protocolo ou recibo (opcional)
                        <input type="text" maxLength={200} value={protocol} onChange={(event) => setProtocol(event.target.value)} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
                      </label>
                    </>
                  ) : (
                    <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {action.kind === "dispense" ? "Motivo da dispensa" : "Motivo (opcional)"}
                      <input type="text" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={reasonError ? true : undefined} aria-describedby={reasonError ? `fiscal-obligation-${item.code}-error` : undefined} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
                      {reasonError ? <span id={`fiscal-obligation-${item.code}-error`} role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{reasonError}</span> : null}
                    </label>
                  )}
                  <button type="submit" disabled={update.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{update.isPending ? "Salvando..." : "Confirmar"}</button>
                  <button type="button" onClick={() => setAction(null)} className={FISCAL_CANCEL_BUTTON_CLASSNAME}>Cancelar</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable && list.data.addable.length ? (
        <form noValidate onSubmit={submitAdd} aria-label="Incluir obrigação" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Incluir obrigação
            <select value={addCode} onChange={(event) => setAddCode(event.target.value as FiscalObligationCode | "")} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
              <option value="">Selecione</option>
              {list.data.addable.map((item) => <option key={item.code} value={item.code}>{item.name}{item.conditional ? " (condicional)" : ""}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Motivo da inclusão
            <input type="text" maxLength={500} value={addReason} onChange={(event) => setAddReason(event.target.value)} aria-invalid={addError ? true : undefined} aria-describedby={addError ? `fiscal-obligation-add-error-${controlId}` : undefined} className={FISCAL_FIELD_CONTROL_CLASSNAME} />
            {addError ? <span id={`fiscal-obligation-add-error-${controlId}`} role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{addError}</span> : null}
          </label>
          <button type="submit" disabled={!addCode || add.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{add.isPending ? "Incluindo..." : "Incluir"}</button>
        </form>
      ) : null}
    </section>
  );
}
