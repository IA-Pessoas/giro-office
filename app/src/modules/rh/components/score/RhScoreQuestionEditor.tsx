import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "@shared/services/toast";
import { Dialog } from "@shared/components";
import { RequiredFieldLabel } from "@shared/components/RequiredFieldLabel";
import {
  useCreateRhScoreQuestionMutation,
  useUpdateRhScoreQuestionMutation,
} from "../../hooks/useRhScore";
import type {
  CreateRhScoreQuestionPayload,
  RhScoreQuestion,
  RhScoreQuestionType,
  UpdateRhScoreQuestionPayload,
} from "../../types";
import { getRhScoreQuestionTypeOptions } from "../../utils/rhScoreUi";
import {
  buildQuestionFormState,
  getErrorMessage,
  type RhScoreQuestionFormState,
} from "./rhScoreShared";

export function RhScoreQuestionEditor({
  open,
  question,
  onClose,
}: {
  open: boolean;
  question: RhScoreQuestion | null;
  onClose: () => void;
}) {
  const createMutation = useCreateRhScoreQuestionMutation();
  const updateMutation = useUpdateRhScoreQuestionMutation();
  const [formState, setFormState] = useState<RhScoreQuestionFormState>(
    buildQuestionFormState(question),
  );

  const isEditing = Boolean(question);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    setFormState(buildQuestionFormState(question));
  }, [open, question]);

  async function handleSubmit() {
    if (!formState.question.trim()) {
      toast.warn("Informe o texto da pergunta.");
      return;
    }

    try {
      if (question) {
        const payload: UpdateRhScoreQuestionPayload = {
          id: question.id,
          question: formState.question.trim(),
          type: formState.type,
        };
        await updateMutation.mutateAsync(payload);
        toast.success("Pergunta atualizada com sucesso.");
      } else {
        const payload: CreateRhScoreQuestionPayload = {
          question: formState.question.trim(),
          type: formState.type,
        };

        await createMutation.mutateAsync(payload);

        toast.success("Pergunta criada com sucesso.");
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar a pergunta."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title={isEditing ? "Editar pergunta de score" : "Nova pergunta de score"}
      description="Formulário de perguntas do score trimestral"
      contentClassName="w-[min(92vw,680px)]"
      bodyClassName="space-y-4"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
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
            {isSubmitting ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar pergunta"}
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <RequiredFieldLabel required>Pergunta</RequiredFieldLabel>
        <textarea
          rows={4}
          value={formState.question}
          onChange={(event) =>
            setFormState((current) => ({
              ...current,
              question: event.target.value,
            }))
          }
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="Ex.: Como foi a colaboração do trimestre?"
          aria-required="true"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <span>Tipo</span>
        <div className="relative">
          <select
            value={formState.type}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                type: event.target.value as RhScoreQuestionType,
              }))
            }
            className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {getRhScoreQuestionTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </label>
    </Dialog>
  );
}
