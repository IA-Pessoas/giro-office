import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { useSignRhTimeSheetMutation } from "../hooks/useRhCalendar";
import type { RhTimeSheetListItem } from "../types";
import { formatRhDateTime } from "../utils/rhDate";

interface RhTimesheetSignDialogProps {
  open: boolean;
  sheet: RhTimeSheetListItem | null;
  onClose: () => void;
}

export function RhTimesheetSignDialog({
  open,
  sheet,
  onClose,
}: RhTimesheetSignDialogProps) {
  const signMutation = useSignRhTimeSheetMutation();
  const [signature, setSignature] = useState("");

  useEffect(() => {
    setSignature("");
  }, [open, sheet?.id]);

  function handleClose() {
    if (signMutation.isPending) {
      return;
    }

    setSignature("");
    onClose();
  }

  async function handleSubmit() {
    const trimmedSignature = signature.trim();

    if (!sheet) {
      return;
    }

    if (!trimmedSignature) {
      toast.warn("Informe sua assinatura.");
      return;
    }

    try {
      await signMutation.mutateAsync({
        id: sheet.id,
        signature: trimmedSignature,
      });

      toast.success("Folha assinada com sucesso.");
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível assinar a folha de ponto.";
      toast.error(message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
      title="Assinar folha de ponto"
      description="Assinatura da folha de ponto"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={signMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={signMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signMutation.isPending ? "Assinando..." : "Assinar folha"}
          </button>
        </>
      }
      contentClassName="w-[min(92vw,560px)]"
      bodyClassName="space-y-4"
    >
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-700/40">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Período selecionado:
        </p>
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
          {sheet
            ? `${formatRhDateTime(sheet.start_time)} até ${formatRhDateTime(sheet.end_time)}`
            : "-"}
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span>Assinatura</span>
        <input
          value={signature}
          onChange={(event) => setSignature(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Digite seu nome completo"
        />
      </label>
    </Dialog>
  );
}
