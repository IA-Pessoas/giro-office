import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { useRequestRhPointAdjustmentMutation } from "../hooks/useRhPoint";
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
  justification: string;
}

const EMPTY_FORM_STATE: RhPointAdjustmentFormState = {
  clockIn: "",
  lunchOut: "",
  lunchIn: "",
  clockOut: "",
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

function buildInitialState(point: RhPointListItem | null): RhPointAdjustmentFormState {
  if (!point) {
    return EMPTY_FORM_STATE;
  }

  return {
    clockIn: toDateTimeLocalValue(point.clock_in),
    lunchOut: toDateTimeLocalValue(point.lunch_out),
    lunchIn: toDateTimeLocalValue(point.lunch_in),
    clockOut: toDateTimeLocalValue(point.clock_out),
    justification: "",
  };
}

export function RhPointAdjustmentRequestModal({
  open,
  point,
  onClose,
}: RhPointAdjustmentRequestModalProps) {
  const requestMutation = useRequestRhPointAdjustmentMutation();
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
    if (requestMutation.isPending) {
      return;
    }

    setFormState(buildInitialState(point));
    onClose();
  }

  async function handleSubmit() {
    if (!point) {
      return;
    }

    const trimmedJustification = formState.justification.trim();

    if (!formState.clockIn || !formState.lunchOut || !formState.lunchIn || !formState.clockOut) {
      toast.warn("Preencha todos os horários do ajuste.");
      return;
    }

    if (!trimmedJustification) {
      toast.warn("Informe a justificativa do ajuste.");
      return;
    }

    try {
      await requestMutation.mutateAsync({
        point_id: point.id,
        clock_in: toIsoDateTime(formState.clockIn),
        lunch_out: toIsoDateTime(formState.lunchOut),
        lunch_in: toIsoDateTime(formState.lunchIn),
        clock_out: toIsoDateTime(formState.clockOut),
        justification: trimmedJustification,
      });

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
      description="Ajuste baseado em um registro de ponto selecionado"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={requestMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={requestMutation.isPending}
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
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Entrada</span>
          <input
            type="datetime-local"
            value={formState.clockIn}
            onChange={(event) => handleChange("clockIn", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Saída almoço</span>
          <input
            type="datetime-local"
            value={formState.lunchOut}
            onChange={(event) => handleChange("lunchOut", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Volta almoço</span>
          <input
            type="datetime-local"
            value={formState.lunchIn}
            onChange={(event) => handleChange("lunchIn", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Saída</span>
          <input
            type="datetime-local"
            value={formState.clockOut}
            onChange={(event) => handleChange("clockOut", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span>Justificativa</span>
        <textarea
          value={formState.justification}
          onChange={(event) => handleChange("justification", event.target.value)}
          rows={4}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Descreva o motivo do ajuste"
        />
      </label>
    </Dialog>
  );
}
