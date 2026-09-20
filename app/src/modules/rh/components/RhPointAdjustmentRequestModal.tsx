import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import {
  useRequestRhPointAdjustmentMutation,
  useUploadRhPointAdjustmentAttachmentMutation,
} from "../hooks/useRhPoint";
import type { RhPointListItem } from "../types";

interface RhPointAdjustmentRequestModalProps {
  open: boolean;
  point: RhPointListItem | null;
  onClose: () => void;
}

interface RhPointAdjustmentFormState {
  clockIn: string;
  lunchOut: string;
  lunchIn: string;
  clockOut: string;
  date: string;
  justification: string;
}

const EMPTY_FORM_STATE: RhPointAdjustmentFormState = {
  clockIn: "",
  lunchOut: "",
  lunchIn: "",
  clockOut: "",
  date: "",
  justification: "",
};

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function buildInitialState(point: RhPointListItem | null): RhPointAdjustmentFormState {
  if (!point) {
    return EMPTY_FORM_STATE;
  }

  return {
    clockIn: toDateTimeLocalValue(point.clock_in),
    lunchOut: toDateTimeLocalValue(point.lunch_out),
    lunchIn: toDateTimeLocalValue(point.lunch_in),
    clockOut: toDateTimeLocalValue(point.clock_out),
    date: toDateInputValue(point.clock_in),
    justification: "",
  };
}

export function RhPointAdjustmentRequestModal({
  open,
  point,
  onClose,
}: RhPointAdjustmentRequestModalProps) {
  const requestMutation = useRequestRhPointAdjustmentMutation();
  const attachmentMutation = useUploadRhPointAdjustmentAttachmentMutation();
  const [attachment, setAttachment] = useState<File | null>(null);
  const [formState, setFormState] = useState<RhPointAdjustmentFormState>(
    buildInitialState(point),
  );

  useEffect(() => {
    setFormState(buildInitialState(point));
  }, [point?.id, open]);

  function handleChange<K extends keyof RhPointAdjustmentFormState>(
    key: K,
    value: RhPointAdjustmentFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleClose() {
    if (requestMutation.isPending || attachmentMutation.isPending) {
      return;
    }

    setFormState(buildInitialState(point));
    setAttachment(null);
    onClose();
  }

  async function handleSubmit() {
    const trimmedJustification = formState.justification.trim();

    if (!formState.clockIn || !formState.lunchOut || !formState.lunchIn || !formState.clockOut) {
      toast.warn("Preencha todos os horários do ajuste.");
      return;
    }

    if (!trimmedJustification) {
      toast.warn("Informe a justificativa do ajuste.");
      return;
    }

    if (!point && !formState.date) {
      toast.warn("Informe a data do dia sem registro.");
      return;
    }

    if (attachment && (attachment.size > 5 * 1024 * 1024 || ![
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(attachment.type))) {
      toast.warn("O comprovante deve ser PDF, JPG, PNG ou WEBP de até 5 MB.");
      return;
    }

    try {
      const createdRequest = await requestMutation.mutateAsync({
        ...(point ? { point_id: point.id } : { date: formState.date }),
        clock_in: toIsoDateTime(formState.clockIn),
        lunch_out: toIsoDateTime(formState.lunchOut),
        lunch_in: toIsoDateTime(formState.lunchIn),
        clock_out: toIsoDateTime(formState.clockOut),
        justification: trimmedJustification,
      });

      if (attachment) {
        await attachmentMutation.mutateAsync({ requestId: createdRequest.id, file: attachment });
      }

      toast.success("Solicitação de ajuste enviada com sucesso.");
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível solicitar o ajuste.";
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
      title="Solicitar ajuste de ponto"
      description={
        point
          ? "Ajuste baseado em um registro de ponto selecionado"
          : "Solicite a inclusão de um dia sem registro de ponto"
      }
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={requestMutation.isPending || attachmentMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={requestMutation.isPending || attachmentMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestMutation.isPending ? "Enviando..." : "Solicitar ajuste"}
          </button>
        </>
      }
      contentClassName="w-[min(92vw,760px)]"
      bodyClassName="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {!point ? (
          <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <RequiredFieldLabel required>Data</RequiredFieldLabel>
            <input
              type="date"
              value={formState.date}
              onChange={(event) => handleChange("date", event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              aria-required="true"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <RequiredFieldLabel required>Entrada</RequiredFieldLabel>
          <input
            type="datetime-local"
            value={formState.clockIn}
            onChange={(event) => handleChange("clockIn", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            aria-required="true"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <RequiredFieldLabel required>Saída almoço</RequiredFieldLabel>
          <input
            type="datetime-local"
            value={formState.lunchOut}
            onChange={(event) => handleChange("lunchOut", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            aria-required="true"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <RequiredFieldLabel required>Volta almoço</RequiredFieldLabel>
          <input
            type="datetime-local"
            value={formState.lunchIn}
            onChange={(event) => handleChange("lunchIn", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            aria-required="true"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <RequiredFieldLabel required>Saída</RequiredFieldLabel>
          <input
            type="datetime-local"
            value={formState.clockOut}
            onChange={(event) => handleChange("clockOut", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            aria-required="true"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <RequiredFieldLabel required>Justificativa</RequiredFieldLabel>
        <textarea
          value={formState.justification}
          onChange={(event) => handleChange("justification", event.target.value)}
          rows={4}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Descreva o motivo do ajuste"
          aria-required="true"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span>Comprovante (opcional)</span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:file:bg-blue-900/30 dark:file:text-blue-300"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          PDF, JPG, PNG ou WEBP · máximo de 5 MB.
        </span>
      </label>
    </Dialog>
  );
}
