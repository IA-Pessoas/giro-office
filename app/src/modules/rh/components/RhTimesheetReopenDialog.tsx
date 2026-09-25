import { useEffect, useState } from "react";
import { toast } from "@shared/services/toast";

import { Dialog } from "@shared/components";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { useReopenRhTimeSheetMutation } from "../hooks/useRhCalendar";
import type { RhTimeSheetListItem } from "../types";
import { formatRhDateTime } from "../utils/rhDate";

interface RhTimesheetReopenDialogProps {
  open: boolean;
  sheet: RhTimeSheetListItem | null;
  onClose: () => void;
}

export function RhTimesheetReopenDialog({
  open,
  sheet,
  onClose,
}: RhTimesheetReopenDialogProps) {
  const mutation = useReopenRhTimeSheetMutation();
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [open, sheet?.id]);

  function close() {
    if (mutation.isPending) return;
    onClose();
  }

  async function submit() {
    if (!sheet) return;
    if (!reason.trim()) {
      toast.warn("Informe o motivo da reabertura.");
      return;
    }

    try {
      await mutation.mutateAsync({ id: sheet.id, reason: reason.trim() });
      toast.success("Folha reaberta com sucesso.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reabrir a folha.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      title="Reabrir folha assinada"
      description="A reabertura libera novos ajustes e fica registrada na auditoria."
      contentClassName="w-[min(92vw,560px)]"
      bodyClassName="space-y-4"
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={mutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={mutation.isPending || !sheet}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Reabrindo..." : "Reabrir folha"}
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-gray-600 dark:text-gray-400">Período selecionado</p>
        <p className="mt-1 font-medium text-gray-900 dark:text-white">
          {sheet ? `${formatRhDateTime(sheet.start_time)} até ${formatRhDateTime(sheet.end_time)}` : "-"}
        </p>
      </div>
      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <RequiredFieldLabel required>Motivo da reabertura</RequiredFieldLabel>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Explique por que a folha precisa ser reaberta"
        />
      </label>
    </Dialog>
  );
}
