import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { useCreateRhTimeSheetMutation } from "../hooks/useRhCalendar";
import type { AssignableUser } from "../types";

interface RhTimesheetGenerateModalProps {
  open: boolean;
  assignableUsers: AssignableUser[];
  defaultUserId: string;
  onClose: () => void;
}

interface RhTimesheetFormState {
  userId: string;
  startTime: string;
  endTime: string;
}

const DEFAULT_FORM_STATE: RhTimesheetFormState = {
  userId: "",
  startTime: "",
  endTime: "",
};

function buildInitialFormState(defaultUserId: string): RhTimesheetFormState {
  return {
    ...DEFAULT_FORM_STATE,
    userId: defaultUserId,
  };
}

function toIsoDateTime(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function RhTimesheetGenerateModal({
  open,
  assignableUsers,
  defaultUserId,
  onClose,
}: RhTimesheetGenerateModalProps) {
  const createMutation = useCreateRhTimeSheetMutation();
  const [formState, setFormState] = useState<RhTimesheetFormState>(
    buildInitialFormState(defaultUserId),
  );

  const isSubmitting = createMutation.isPending;

  useEffect(() => {
    setFormState(buildInitialFormState(defaultUserId));
  }, [defaultUserId, open]);

  function handleChange<K extends keyof RhTimesheetFormState>(
    key: K,
    value: RhTimesheetFormState[K],
  ) {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleClose() {
    setFormState(buildInitialFormState(defaultUserId));
    onClose();
  }

  async function handleSubmit() {
    const startTime = toIsoDateTime(formState.startTime);
    const endTime = toIsoDateTime(formState.endTime);

    if (!formState.userId) {
      toast.warn("Selecione o colaborador.");
      return;
    }

    if (Boolean(startTime) !== Boolean(endTime)) {
      toast.warn("Preencha o início e o fim da folha ou deixe os dois vazios.");
      return;
    }

    if (startTime && endTime && new Date(startTime).getTime() >= new Date(endTime).getTime()) {
      toast.warn("O fim da folha deve ser posterior ao início.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        user_id: formState.userId,
        ...(startTime && endTime ? { start_time: startTime, end_time: endTime } : {}),
      });

      toast.success("Folha gerada com sucesso.");
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível gerar a folha de ponto.";
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
      title="Gerar folha de ponto"
      description="Formulário de geração de folha de ponto"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Gerando..." : "Gerar folha"}
          </button>
        </>
      }
      contentClassName="w-[min(92vw,720px)]"
      bodyClassName="space-y-4"
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Selecione o colaborador. Sem período informado, a folha usa automaticamente do dia 22 do
        mês anterior ao dia 22 do mês atual.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
          <span>Colaborador</span>
          <div className="relative">
            <select
              value={formState.userId}
              onChange={(event) => handleChange("userId", event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Selecione</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Início (opcional)</span>
          <input
            type="datetime-local"
            value={formState.startTime}
            onChange={(event) => handleChange("startTime", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Fim (opcional)</span>
          <input
            type="datetime-local"
            value={formState.endTime}
            onChange={(event) => handleChange("endTime", event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </label>
      </div>
    </Dialog>
  );
}
