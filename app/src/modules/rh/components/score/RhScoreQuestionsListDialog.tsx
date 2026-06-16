import {
  ChevronDown,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Dialog } from "@shared/components";
import type { RhScoreQuestion } from "../../types";
import { getRhScoreQuestionTypeOptions, getRhScoreTypeLabel } from "../../utils/rhScoreUi";
import { getErrorMessage, type RhScoreQuestionFilter } from "./rhScoreShared";

interface RhScoreQuestionsListDialogProps {
  open: boolean;
  questions: RhScoreQuestion[];
  totalQuestions: number;
  selectedType: RhScoreQuestionFilter;
  isLoading: boolean;
  error: unknown;
  isUpdating: boolean;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeChange: (type: RhScoreQuestionFilter) => void;
  onEdit: (question: RhScoreQuestion) => void;
  onToggle: (question: RhScoreQuestion) => void;
  onDelete: (question: RhScoreQuestion) => void;
}

export function RhScoreQuestionsListDialog({
  open,
  questions,
  totalQuestions,
  selectedType,
  isLoading,
  error,
  isUpdating,
  isDeleting,
  onOpenChange,
  onTypeChange,
  onEdit,
  onToggle,
  onDelete,
}: RhScoreQuestionsListDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Perguntas cadastradas"
      description="Consulte, edite e gerencie as perguntas de score em um só lugar."
      contentClassName="!w-[min(92vw,860px)]"
      bodyClassName="space-y-4"
    >
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {totalQuestions} {totalQuestions === 1 ? "pergunta disponível" : "perguntas disponíveis"}{" "}
          para gestão do score.
        </p>

        <div className="relative min-w-[220px]">
          <select
            value={selectedType}
            onChange={(event) => onTypeChange(event.target.value as RhScoreQuestionFilter)}
            className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="all">Todos os tipos</option>
            {getRhScoreQuestionTypeOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando perguntas...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(error, "Não foi possível carregar as perguntas de score.")}
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          Nenhuma pergunta encontrada para o filtro selecionado.
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <article
              key={question.id}
              className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-600"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {getRhScoreTypeLabel(question.type)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      {question.active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-gray-900 dark:text-white">
                    {question.question}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(question)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(question)}
                    disabled={isUpdating}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Sparkles className="h-4 w-4" />
                    {question.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(question)}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Dialog>
  );
}
