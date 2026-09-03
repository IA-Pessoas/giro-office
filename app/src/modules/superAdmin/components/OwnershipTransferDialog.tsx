import { Dialog } from "@shared/components";
import { useEffect, useMemo, useState } from "react";

import type {
  PlatformOrganization,
  PlatformOrganizationUser,
  PreviousOwnerAction,
} from "../types";

const CONTROL_CLASSNAME =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

interface OwnershipTransferDialogProps {
  organization: PlatformOrganization;
  currentOwner: PlatformOrganizationUser | null;
  users: PlatformOrganizationUser[];
  isConfirming: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (input: {
    successorUserId: string;
    previousOwnerAction: PreviousOwnerAction;
    justification: string;
  }) => Promise<void>;
  open: boolean;
}

export function OwnershipTransferDialog({
  organization,
  currentOwner,
  users,
  isConfirming,
  onOpenChange,
  onTransfer,
  open,
}: OwnershipTransferDialogProps) {
  const [successorUserId, setSuccessorUserId] = useState("");
  const [previousOwnerAction, setPreviousOwnerAction] = useState<PreviousOwnerAction>("demote");
  const [justification, setJustification] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const candidates = useMemo(
    () =>
      users.filter(
        (user) =>
          user.id !== currentOwner?.id && user.status === "active" && user.type !== "owner",
      ),
    [currentOwner?.id, users],
  );
  const successor = candidates.find((user) => user.id === successorUserId);
  const normalizedJustification = justification.trim();

  useEffect(() => {
    if (!open) {
      setSuccessorUserId("");
      setPreviousOwnerAction("demote");
      setJustification("");
      setErrorMessage(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!currentOwner || !successor || !normalizedJustification) {
      setErrorMessage("Selecione um sucessor ativo e informe a justificativa.");
      return;
    }

    setErrorMessage(null);
    try {
      await onTransfer({
        successorUserId: successor.id,
        previousOwnerAction,
        justification: normalizedJustification,
      });
      onOpenChange(false);
    } catch {
      setErrorMessage("Não foi possível transferir o ownership. Revise os dados e tente novamente.");
    }
  };

  const consequence =
    previousOwnerAction === "deactivate"
      ? "O owner anterior será desativado e suas sessões serão revogadas."
      : "O owner anterior será rebaixado para administrador e suas sessões serão revogadas.";

  return (
    <Dialog
      bodyClassName="space-y-4"
      contentClassName="!w-[min(92vw,560px)]"
      description="Confirme os envolvidos e a consequência antes de concluir esta ação excepcional."
      footer={
        <>
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={isConfirming}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isConfirming || !successor || !normalizedJustification}
            onClick={() => void handleConfirm()}
            type="button"
          >
            {isConfirming ? "Transferindo..." : "Confirmar transferência"}
          </button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      preventClose={isConfirming}
      title="Transferir ownership"
    >
      <dl className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/70">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Organização</dt>
          <dd className="font-semibold text-slate-950 dark:text-white">{organization.name}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Owner atual</dt>
          <dd className="font-semibold text-slate-950 dark:text-white">{currentOwner?.name ?? "Indisponível"}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Sucessor</dt>
          <dd className="font-semibold text-slate-950 dark:text-white">{successor?.name ?? "Selecione abaixo"}</dd>
        </div>
      </dl>

      <div>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-100" htmlFor="ownership-successor">
          Sucessor ativo
        </label>
        <select
          className={`${CONTROL_CLASSNAME} mt-1.5`}
          id="ownership-successor"
          onChange={(event) => setSuccessorUserId(event.target.value)}
          value={successorUserId}
        >
          <option value="">Selecione o sucessor</option>
          {candidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.login})
            </option>
          ))}
        </select>
        {!candidates.length ? (
          <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-300" role="alert">
            Não há sucessor ativo elegível na lista carregada.
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-100" htmlFor="ownership-previous-action">
          Consequência para o owner anterior
        </label>
        <select
          className={`${CONTROL_CLASSNAME} mt-1.5`}
          id="ownership-previous-action"
          onChange={(event) => setPreviousOwnerAction(event.target.value as PreviousOwnerAction)}
          value={previousOwnerAction}
        >
          <option value="demote">Rebaixar para administrador</option>
          <option value="deactivate">Desativar usuário</option>
        </select>
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{consequence}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-100" htmlFor="ownership-justification">
          Justificativa
        </label>
        <textarea
          className={`${CONTROL_CLASSNAME} mt-1.5 min-h-24 resize-y`}
          id="ownership-justification"
          maxLength={500}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="Explique a recuperação ou transferência excepcional."
          value={justification}
        />
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </Dialog>
  );
}
