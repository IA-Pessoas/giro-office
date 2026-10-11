import { Dialog } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { FISCAL_RESPONSIBLES_QUERY_KEY } from "../hooks/queryKeys";
import { fiscalControlService } from "../services/fiscalControlService";
import { formatTransferResult, getFiscalErrorMessage } from "../utils";
import {
  FISCAL_CANCEL_BUTTON_CLASSNAME,
  FISCAL_FIELD_CONTROL_CLASSNAME,
  FISCAL_FIELD_ERROR_CLASSNAME,
  FISCAL_PRIMARY_BUTTON_CLASSNAME,
  FISCAL_TEXTAREA_CLASSNAME,
} from "./fiscalFieldStyles";

/** Transferência de responsável (Fiscal nível 3): destino com acesso ao Fiscal e motivo. */
export function FiscalControlTransferDialog({
  controlIds,
  open,
  onOpenChange,
  onTransferred,
}: {
  controlIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: () => void;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const candidates = useFetch(FISCAL_RESPONSIBLES_QUERY_KEY, () => fiscalControlService.responsibles(), {
    enabled: open,
  });
  const transfer = useMutation({
    mutationFn: () =>
      fiscalControlService.transfer({ control_ids: controlIds, to_user_id: target, reason: reason.trim() }),
    onSuccess: (result) => {
      const message = formatTransferResult(result);
      if (result.transferred.length) toast.success(message);
      else toast.error(message);
      setTarget("");
      setReason("");
      onTransferred();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(getFiscalErrorMessage(failure)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) {
      setError("Escolha o novo responsável.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Informe o motivo com pelo menos 3 caracteres.");
      return;
    }
    setError(null);
    transfer.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transferir responsável"
      description={`${controlIds.length === 1 ? "1 controle selecionado" : `${controlIds.length} controles selecionados`}. Controles concluídos não são transferidos; o motivo fica registrado na trilha.`}
      preventClose={transfer.isPending}
      contentClassName="!w-[min(92vw,440px)]"
    >
      <form noValidate onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Novo responsável
          <select value={target} onChange={(event) => setTarget(event.target.value)} disabled={candidates.isLoading} className={FISCAL_FIELD_CONTROL_CLASSNAME}>
            <option value="">{candidates.isLoading ? "Carregando..." : "Selecione"}</option>
            {(candidates.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        {candidates.error ? <p role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{getFiscalErrorMessage(candidates.error)}</p> : null}
        <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Motivo
          <textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "fiscal-control-transfer-error" : undefined} className={FISCAL_TEXTAREA_CLASSNAME} />
        </label>
        {error ? <span id="fiscal-control-transfer-error" role="alert" className={FISCAL_FIELD_ERROR_CLASSNAME}>{error}</span> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} disabled={transfer.isPending} className={FISCAL_CANCEL_BUTTON_CLASSNAME}>Cancelar</button>
          <button type="submit" disabled={transfer.isPending} className={FISCAL_PRIMARY_BUTTON_CLASSNAME}>{transfer.isPending ? "Transferindo..." : "Transferir"}</button>
        </div>
      </form>
    </Dialog>
  );
}
