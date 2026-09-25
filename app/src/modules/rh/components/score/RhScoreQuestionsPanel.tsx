import { useState } from "react";
import { Eye, Loader2, Plus } from "lucide-react";
import { ConfirmationDialog } from "@shared/components";
import { toast } from "@shared/services/toast";
import {
  useDeleteRhScoreQuestionMutation,
  useRhScoreQuestions,
  useUpdateRhScoreQuestionMutation,
} from "../../hooks/useRhScore";
import type { RhScoreQuestion } from "../../types";
import { RhScoreQuestionEditor } from "./RhScoreQuestionEditor";
import { RhScoreQuestionsListDialog } from "./RhScoreQuestionsListDialog";
import { RhScoreQuarterGenerationPanel } from "./RhScoreQuarterGenerationPanel";
import { getErrorMessage, type RhScoreQuestionFilter } from "./rhScoreShared";

export function RhScoreQuestionsPanel({ canManageScore }: { canManageScore: boolean }) {
  const [selectedType, setSelectedType] = useState<RhScoreQuestionFilter>("all");
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isQuestionListOpen, setIsQuestionListOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<RhScoreQuestion | null>(null);
  const [questionPendingDelete, setQuestionPendingDelete] = useState<RhScoreQuestion | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([]);
  const questionsQuery = useRhScoreQuestions({
    all: true,
    type: selectedType === "all" ? undefined : selectedType,
  });
  const updateMutation = useUpdateRhScoreQuestionMutation();
  const deleteMutation = useDeleteRhScoreQuestionMutation();
  const questions = (questionsQuery.data ?? []).filter(
    (question) => !deletedQuestionIds.includes(question.id),
  );
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

  function handleRequestDeleteQuestion(question: RhScoreQuestion) {
    setQuestionPendingDelete(question);
  }

  function handleCloseDeleteDialog() {
    if (deleteMutation.isPending) {
      return;
    }

    setQuestionPendingDelete(null);
    setDeleteError(null);
  }

  async function handleConfirmDeleteQuestion() {
    if (!questionPendingDelete) {
      return;
    }

    const deletedQuestionId = questionPendingDelete.id;

    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ id: deletedQuestionId });
      setDeletedQuestionIds((currentIds) =>
        currentIds.includes(deletedQuestionId) ? currentIds : [...currentIds, deletedQuestionId],
      );
      setQuestionPendingDelete(null);
      toast.success("Pergunta excluída com sucesso.");
    } catch (error) {
      const message = getErrorMessage(error, "Não foi possível excluir a pergunta.");
      setDeleteError(message);
      // Relança para o diálogo permanecer aberto com o erro.
      throw error;
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

      <RhScoreQuestionsListDialog
        open={isQuestionListOpen}
        questions={questions}
        totalQuestions={totalQuestions}
        selectedType={selectedType}
        isLoading={questionsQuery.isLoading}
        error={questionsQuery.error}
        isUpdating={updateMutation.isPending}
        isDeleting={deleteMutation.isPending}
        onOpenChange={setIsQuestionListOpen}
        onTypeChange={setSelectedType}
        onEdit={handleEditQuestion}
        onToggle={handleToggleQuestion}
        onDelete={handleRequestDeleteQuestion}
      />

      <ConfirmationDialog
        open={Boolean(questionPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
        title="Excluir pergunta de score"
        description={`Excluir a pergunta "${questionPendingDelete?.question ?? ""}"? Esta ação remove a pergunta de score e não poderá ser desfeita.`}
        onConfirm={handleConfirmDeleteQuestion}
        isConfirming={deleteMutation.isPending}
        errorMessage={deleteError}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />

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
