import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import { useCreateRhRetroactivePointMutation } from "../hooks/useRhPoint";

interface RhPointRetroactiveModalProps {
  open: boolean;
  targetUserId: string;
  targetUserLabel: string;
  onClose: () => void;
}

interface FormState {
  date: string;
  clockIn: string;
  lunchOut: string;
  lunchIn: string;
  clockOut: string;
  justification: string;
}

const EMPTY_FORM: FormState = {
  date: "",
  clockIn: "",
  lunchOut: "",
  lunchIn: "",
  clockOut: "",
  justification: "",
};

function toIso(value: string) {
  return new Date(value).toISOString();
}

export function RhPointRetroactiveModal({
  open,
  targetUserId,
  targetUserLabel,
  onClose,
}: RhPointRetroactiveModalProps) {
  const mutation = useCreateRhRetroactivePointMutation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open, targetUserId]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function close() {
    if (mutation.isPending) return;
    onClose();
  }

  async function submit() {
    if (!form.date || !form.clockIn || !form.lunchOut || !form.lunchIn || !form.clockOut) {
      toast.warn("Preencha a data e todos os horários.");
      return;
    }
    if (!form.justification.trim()) {
      toast.warn("Informe a justificativa da entrada retroativa.");
      return;
    }

    try {
      await mutation.mutateAsync({
        target_user_id: targetUserId,
        date: form.date,
        clock_in: toIso(form.clockIn),
        lunch_out: toIso(form.lunchOut),
        lunch_in: toIso(form.lunchIn),
        clock_out: toIso(form.clockOut),
        justification: form.justification.trim(),
      });
      toast.success("Entrada retroativa criada com sucesso.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a entrada.");
    }
  }

  const fields: Array<[keyof FormState, string]> = [
    ["clockIn", "Entrada"],
    ["lunchOut", "Saída almoço"],
    ["lunchIn", "Volta almoço"],
    ["clockOut", "Saída"],
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      title="Lançamento retroativo"
      description={`Criar ponto aprovado para ${targetUserLabel}`}
      contentClassName="w-[min(92vw,760px)]"
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
            disabled={mutation.isPending || !targetUserId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Salvando..." : "Criar lançamento"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <RequiredFieldLabel required>Data</RequiredFieldLabel>
        <input
          type="date"
          value={form.date}
          onChange={(event) => change("date", event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
            <RequiredFieldLabel required>{label}</RequiredFieldLabel>
            <input
              type="datetime-local"
              value={form[key]}
              onChange={(event) => change(key, event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <RequiredFieldLabel required>Justificativa</RequiredFieldLabel>
        <textarea
          value={form.justification}
          onChange={(event) => change("justification", event.target.value)}
          rows={4}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Descreva o motivo do lançamento retroativo"
        />
      </label>
    </Dialog>
  );
}
