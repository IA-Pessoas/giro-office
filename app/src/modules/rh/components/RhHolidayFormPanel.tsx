import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import {
  useCreateRhHolidayMutation,
  useUpdateRhHolidayMutation,
} from "../hooks/useRhCalendar";
import type { RhHoliday } from "../types";

interface RhHolidayFormPanelProps {
  holiday: RhHoliday | null;
  onClose: () => void;
}

interface RhHolidayFormState {
  name: string;
  date: string;
}

const DEFAULT_FORM_STATE: RhHolidayFormState = {
  name: "",
  date: "",
};

function buildFormState(holiday: RhHoliday | null): RhHolidayFormState {
  if (!holiday) {
    return DEFAULT_FORM_STATE;
  }

  return {
    name: holiday.name.trim(),
    date: holiday.date.slice(0, 10),
  };
}

export function RhHolidayFormPanel({
  holiday,
  onClose,
}: RhHolidayFormPanelProps) {
  const createMutation = useCreateRhHolidayMutation();
  const updateMutation = useUpdateRhHolidayMutation();
  const [formState, setFormState] = useState<RhHolidayFormState>(
    buildFormState(holiday),
  );

  const isEditing = Boolean(holiday);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    setFormState(buildFormState(holiday));
  }, [holiday]);

  function handleChange<K extends keyof RhHolidayFormState>(
    key: K,
    value: RhHolidayFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleCancel() {
    setFormState(buildFormState(holiday));
    onClose();
  }

  async function handleSubmit() {
    if (!formState.name.trim() || !formState.date) {
      toast.warn("Preencha o nome e a data do feriado.");
      return;
    }

    try {
      if (holiday) {
        await updateMutation.mutateAsync({
          id: holiday.id,
          name: formState.name.trim(),
          date: formState.date,
        });
        toast.success("Feriado atualizado com sucesso.");
      } else {
        await createMutation.mutateAsync({
          name: formState.name.trim(),
          date: formState.date,
        });
        toast.success("Feriado criado com sucesso.");
      }

      setFormState(DEFAULT_FORM_STATE);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar o feriado.";
      toast.error(message);
    }
  }

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Editar feriado" : "Novo feriado"}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Informe o nome e a data do feriado.
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

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr,200px]">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <RequiredFieldLabel required>Nome</RequiredFieldLabel>
          <input
            value={formState.name}
            onChange={(event) => handleChange("name", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Ex.: Carnaval"
            aria-required="true"
          />
        </label>

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
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "Salvando..."
            : isEditing
              ? "Salvar alterações"
              : "Criar feriado"}
        </button>
      </div>
    </section>
  );
}
