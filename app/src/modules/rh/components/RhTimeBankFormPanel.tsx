import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import {
  useCreateRhTimeBankReleaseMutation,
} from "../hooks/useRhCalendar";
import type { AssignableUser } from "../types";

interface RhTimeBankFormPanelProps {
  assignableUsers: AssignableUser[];
  defaultUserId: string;
  onClose: () => void;
}

interface RhTimeBankFormState {
  userId: string;
  date: string;
  minutes: string;
  reason: string;
}

const DEFAULT_FORM_STATE: RhTimeBankFormState = {
  userId: "",
  date: "",
  minutes: "",
  reason: "",
};

function buildInitialFormState(defaultUserId: string): RhTimeBankFormState {
  return {
    ...DEFAULT_FORM_STATE,
    userId: defaultUserId,
  };
}

export function RhTimeBankFormPanel({
  assignableUsers,
  defaultUserId,
  onClose,
}: RhTimeBankFormPanelProps) {
  const createMutation = useCreateRhTimeBankReleaseMutation();
  const [formState, setFormState] = useState<RhTimeBankFormState>(
    buildInitialFormState(defaultUserId),
  );

  useEffect(() => {
    setFormState(buildInitialFormState(defaultUserId));
  }, [defaultUserId]);

  function handleChange<K extends keyof RhTimeBankFormState>(
    key: K,
    value: RhTimeBankFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleCancel() {
    setFormState(buildInitialFormState(defaultUserId));
    onClose();
  }

  async function handleSubmit() {
    const trimmedReason = formState.reason.trim();
    const parsedMinutes = Number(formState.minutes);

    if (!formState.userId) {
      toast.warn("Selecione o colaborador.");
      return;
    }

    if (!formState.date) {
      toast.warn("Informe a data do lancamento.");
      return;
    }

    if (!Number.isInteger(parsedMinutes) || parsedMinutes === 0) {
      toast.warn("Informe um valor inteiro diferente de zero em minutos.");
      return;
    }

    if (!trimmedReason) {
      toast.warn("Informe o motivo do lancamento.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        user_id: formState.userId,
        date: formState.date,
        minutes: parsedMinutes,
        reason: trimmedReason,
      });

      toast.success("Lancamento criado com sucesso.");
      setFormState(buildInitialFormState(defaultUserId));
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar o lancamento.";
      toast.error(message);
    }
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Novo lancamento
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Informe colaborador, data, minutos e motivo do ajuste manual.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,1fr),200px,160px]">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Colaborador</span>
          <select
            value={formState.userId}
            onChange={(event) => handleChange("userId", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Selecione</option>
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Data</span>
          <input
            type="date"
            value={formState.date}
            onChange={(event) => handleChange("date", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Minutos</span>
          <input
            type="number"
            step={1}
            value={formState.minutes}
            onChange={(event) => handleChange("minutes", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Ex.: 120"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span>Motivo</span>
        <textarea
          value={formState.reason}
          onChange={(event) => handleChange("reason", event.target.value)}
          className="min-h-[96px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Descreva o motivo do lancamento."
        />
      </label>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createMutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? "Salvando..." : "Criar lancamento"}
        </button>
      </div>
    </section>
  );
}
