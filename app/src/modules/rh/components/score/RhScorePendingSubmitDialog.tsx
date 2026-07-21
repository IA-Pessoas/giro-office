import { Dialog } from "@shared/components";
import type { RhPendingScoreEvaluation, RhScoreEvaluationAnswer } from "../../types";
import {
  formatRhQuarterLabel,
  getRhPendingEvaluationTargetName,
  getRhScoreEvaluatorRoleLabel,
  getRhScoreQuestionPrompt,
  getRhScoreTypeLabel,
} from "../../utils/rhScoreUi";
import { getScoreChoiceClassName } from "./rhScoreShared";

interface RhScorePendingSubmitDialogProps {
  evaluation: RhPendingScoreEvaluation | null;
  answers: RhScoreEvaluationAnswer[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  onUpdateAnswer: (questionId: string, value: number) => void;
  onUpdateObservation: (questionId: string, value: string) => void;
}

export function RhScorePendingSubmitDialog({
  evaluation,
  answers,
  isSubmitting,
  onClose,
  onSubmit,
  onUpdateAnswer,
  onUpdateObservation,
}: RhScorePendingSubmitDialogProps) {
  return (
    <Dialog
      open={Boolean(evaluation)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Submeter avaliação"
      description={
        evaluation
          ? `${getRhPendingEvaluationTargetName(evaluation)} - ${formatRhQuarterLabel(
              evaluation.scoreQuarter.quarter,
            )}`
          : "Preencha as respostas do trimestre."
      }
      contentClassName="w-[min(94vw,960px)]"
      bodyClassName="max-h-[80vh] space-y-5 overflow-y-auto"
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
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Enviando..." : "Enviar avaliação"}
          </button>
        </>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-5 text-white shadow-sm dark:border-slate-700">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/90">
              Avaliação pendente
            </p>

            <h3 className="mt-2 text-2xl font-semibold">
              {evaluation ? getRhPendingEvaluationTargetName(evaluation) : "-"}
            </h3>

            <p className="mt-2 text-sm text-slate-200">
              Responda este ciclo com notas de 1 a 5 e, se quiser, complemente com contexto.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/80">
                Trimestre
              </p>

              <p className="mt-2 text-sm font-semibold text-white">
                {evaluation ? formatRhQuarterLabel(evaluation.scoreQuarter.quarter) : "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/80">Tipo</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {evaluation ? getRhScoreTypeLabel(evaluation.type) : "-"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/80">Papel</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {getRhScoreEvaluatorRoleLabel(evaluation?.evaluator_role)}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="space-y-4">
        {evaluation
          ? answers.map((answer, index) => (
              <div
                key={answer.question_id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                    Pergunta {index + 1}
                  </span>

                  <p className="text-base font-semibold leading-7 text-slate-900 dark:text-white">
                    {getRhScoreQuestionPrompt(answer.question_text, answer.question_id)}
                  </p>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          Nota da pergunta
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Selecione um valor entre 1 e 5
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5].map((scoreValue) => (
                          <button
                            key={scoreValue}
                            type="button"
                            onClick={() => onUpdateAnswer(answer.question_id, scoreValue)}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${getScoreChoiceClassName(
                              answer.answer === scoreValue,
                            )}`}
                          >
                            {scoreValue}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span>Observação</span>
                    <textarea
                      rows={3}
                      value={answer.obs ?? ""}
                      onChange={(event) =>
                        onUpdateObservation(answer.question_id, event.target.value)
                      }
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      placeholder="Comentário adicional opcional"
                    />
                  </label>
                </div>
              </div>
            ))
          : null}
      </div>
    </Dialog>
  );
}
