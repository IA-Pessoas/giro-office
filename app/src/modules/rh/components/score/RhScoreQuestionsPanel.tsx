import { useState } from "react";
import { ChevronDown, Eye, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { Dialog } from "@shared/components";
import {
  useDeleteRhScoreQuestionMutation,
  useRhScoreQuestions,
  useUpdateRhScoreQuestionMutation,
} from "../../hooks/useRhScore";
import type { RhScoreQuestion } from "../../types";
import { getRhScoreQuestionTypeOptions, getRhScoreTypeLabel } from "../../utils/rhScoreUi";
import { RhScoreQuestionEditor } from "./RhScoreQuestionEditor";
import { RhScoreQuarterGenerationPanel } from "./RhScoreQuarterGenerationPanel";
import { getErrorMessage, type RhScoreQuestionFilter } from "./rhScoreShared";

export function RhScoreQuestionsPanel({ canManageScore }: { canManageScore: boolean }) {
  const [selectedType, setSelectedType] = useState<RhScoreQuestionFilter>("all");
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isQuestionListOpen, setIsQuestionListOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<RhScoreQuestion | null>(null);
  const questionsQuery = useRhScoreQuestions({
    all: true,
    type: selectedType === "all" ? undefined : selectedType,
  });
  const updateMutation = useUpdateRhScoreQuestionMutation();
  const deleteMutation = useDeleteRhScoreQuestionMutation();
  const questions = questionsQuery.data ?? [];
  const totalQuestions = questions.length;

  function handleNewQuestion() {
    setEditingQuestion(null);
    setIsQuestionDialogOpen(true);
  }

  function handleEditQuestion(question: RhScoreQuestion) {
    setEditingQuestion(question);
    setIsQuestionDialogOpen(true);
  }

  async function handleToggleQuestion(question: RhScoreQuestion) {
    try {
      await updateMutation.mutateAsync({
        id: question.id,
        active: !question.active,
      });
      toast.success(
        question.active ? "Pergunta desativada com sucesso." : "Pergunta ativada com sucesso.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar a pergunta."));
    }
  }

  async function handleDeleteQuestion(question: RhScoreQuestion) {
    if (!window.confirm("Deseja realmente excluir esta pergunta de score?")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({ id: question.id });
      toast.success("Pergunta excluída com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível excluir a pergunta."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="h-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Perguntas de score
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Cadastre e organize as perguntas do score.
              </p>

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                {questionsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando preview...
                  </div>
                ) : questionsQuery.error ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Preview indisponível no momento.
                  </p>
                ) : questions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma pergunta cadastrada ainda.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {questions.slice(0, 3).map((question) => (
                      <div key={question.id} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-300" />
                        <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                          {question.question}
                        </p>
                      </div>
                    ))}

                    {totalQuestions > 3 ? (
                      <p className="pt-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        +{totalQuestions - 3} perguntas cadastradas
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setIsQuestionListOpen(true)}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Eye className="h-4 w-4" />
                Perguntas cadastradas
              </button>

              <button
                type="button"
                onClick={handleNewQuestion}
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
                Nova pergunta
              </button>
            </div>
          </div>
        </section>

        <RhScoreQuarterGenerationPanel canManageScore={canManageScore} />
      </div>
      <Dialog
        open={isQuestionListOpen}
        onOpenChange={(nextOpen) => setIsQuestionListOpen(nextOpen)}
        title="Perguntas cadastradas"
        description="Consulte, edite e gerencie as perguntas de score em um só lugar."
        contentClassName="w-[min(94vw,1100px)]"
        bodyClassName="space-y-5"
      >
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {totalQuestions}{" "}
            {totalQuestions === 1 ? "pergunta disponível" : "perguntas disponíveis"} para gestão
            do score.
          </p>

          <div className="relative min-w-[220px]">
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as RhScoreQuestionFilter)}
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

        {questionsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando perguntas...
          </div>
        ) : questionsQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(
              questionsQuery.error,
              "Não foi possível carregar as perguntas de score.",
            )}
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
                      onClick={() => handleEditQuestion(question)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleQuestion(question)}
                      disabled={updateMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Sparkles className="h-4 w-4" />
                      {question.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(question)}
                      disabled={deleteMutation.isPending}
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
      <RhScoreQuestionEditor
        open={isQuestionDialogOpen}
        question={editingQuestion}
        onClose={() => {
          setIsQuestionDialogOpen(false);
          setEditingQuestion(null);
        }}
      />
    </div>
  );
}
