import { useEffect, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import {
  useRhPendingScoreEvaluations,
  useSubmitRhScoreEvaluationMutation,
} from "../../hooks/useRhScore";
import type { RhPendingScoreEvaluation, RhScoreEvaluationAnswer } from "../../types";
import {
  formatRhQuarterLabel,
  formatRhScoreValue,
  getRhPendingEvaluationTargetName,
  getRhScoreEvaluatorRoleLabel,
  getRhScoreStatusLabel,
  getRhScoreTypeLabel,
} from "../../utils/rhScoreUi";
import { RhScorePendingSubmitDialog } from "./RhScorePendingSubmitDialog";
import { getErrorMessage } from "./rhScoreShared";

export function RhScorePendingPanel() {
  const pendingQuery = useRhPendingScoreEvaluations();
  const submitMutation = useSubmitRhScoreEvaluationMutation();
  const [selectedEvaluation, setSelectedEvaluation] = useState<RhPendingScoreEvaluation | null>(
    null,
  );
  const [answers, setAnswers] = useState<RhScoreEvaluationAnswer[]>([]);

  useEffect(() => {
    if (!selectedEvaluation) {
      setAnswers([]);
      return;
    }

    setAnswers(
      selectedEvaluation.answers.map((answer) => ({
        question_id: answer.question_id,
        question_text: answer.question_text,
        answer: answer.answer ?? 0,
        obs: answer.obs ?? "",
      })),
    );
  }, [selectedEvaluation]);

  function updateAnswer(questionId: string, value: number) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.question_id === questionId
          ? {
              ...answer,
              answer: value,
            }
          : answer,
      ),
    );
  }

  function updateObservation(questionId: string, value: string) {
    setAnswers((current) =>
      current.map((answer) =>
        answer.question_id === questionId
          ? {
              ...answer,
              obs: value,
            }
          : answer,
      ),
    );
  }

  async function handleSubmitEvaluation() {
    if (!selectedEvaluation) {
      return;
    }

    const hasInvalidAnswer = answers.some(
      (answer) => !Number.isFinite(answer.answer) || answer.answer < 1,
    );

    if (hasInvalidAnswer) {
      toast.warn("Responda todas as perguntas com uma nota de 1 a 5.");
      return;
    }

    try {
      await submitMutation.mutateAsync({
        evaluation_id: selectedEvaluation.id,
        answers: answers.map((answer) => ({
          question_id: answer.question_id,
          answer: answer.answer,
          obs: answer.obs?.trim() ? answer.obs.trim() : undefined,
        })),
      });
      toast.success("Avaliação enviada com sucesso.");
      setSelectedEvaluation(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível enviar a avaliação."));
    }
  }

  const pendingEvaluations = pendingQuery.data ?? [];

  return (
    <>
      {pendingQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-14 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando avaliações pendentes...
        </div>
      ) : pendingQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(
            pendingQuery.error,
            "Não foi possível carregar as avaliações pendentes.",
          )}
        </div>
      ) : pendingEvaluations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-300">
            <Award className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            Nenhuma avaliação pendente
          </h3>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Quando houver avaliações atribuídas ao seu perfil, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pendingEvaluations.map((evaluation) => (
            <article
              key={evaluation.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
                    {formatRhQuarterLabel(evaluation.scoreQuarter.quarter)}
                  </p>

                  <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {getRhPendingEvaluationTargetName(evaluation)}
                  </h3>

                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {getRhScoreTypeLabel(evaluation.type)} {"\u2022 "}
                    {getRhScoreEvaluatorRoleLabel(evaluation.evaluator_role)}
                  </p>
                </div>

                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  {getRhScoreStatusLabel(evaluation.status)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Perguntas
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {evaluation.answers.length}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Média atual
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {formatRhScoreValue(evaluation.average_score)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEvaluation(evaluation)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Award className="h-4 w-4" />
                Responder avaliação
              </button>
            </article>
          ))}
        </div>
      )}
      <RhScorePendingSubmitDialog
        evaluation={selectedEvaluation}
        answers={answers}
        isSubmitting={submitMutation.isPending}
        onClose={() => setSelectedEvaluation(null)}
        onSubmit={handleSubmitEvaluation}
        onUpdateAnswer={updateAnswer}
        onUpdateObservation={updateObservation}
      />
    </>
  );
}
