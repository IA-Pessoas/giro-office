import { useEffect, useState } from "react";
import { Eye, Loader2, Save, Target } from "lucide-react";
import { toast } from "react-toastify";
import { Dialog } from "@shared/components";
import { useRhScoreDetail, useUpdateRhQuarterNitroMutation } from "../../hooks/useRhScore";
import type { RhNitroMetricType, RhScoreQuestionType } from "../../types";
import {
  formatRhEvaluationCountLabel,
  formatRhQuarterLabel,
  formatRhScoreValue,
  getRhScoreDetailCategoryRows,
  getRhScoreEvaluatorRoleLabel,
  getRhScoreQuestionPrompt,
  getRhScoreStatusLabel,
  getRhScoreTypeLabel,
  getRhScoreUserSummary,
} from "../../utils/rhScoreUi";
import {
  EMPTY_NITRO_DRAFT,
  RH_NITRO_MAX,
  RH_NITRO_MIN,
  RH_SCORE_EVALUATION_GROUP_ORDER,
  RH_VISIBLE_NITRO_METRICS,
  buildNitroDraft,
  getErrorMessage,
  getNitroMetricLabel,
  getScoreChoiceClassName,
  normalizeNitroInput,
  type NitroDraftState,
} from "./rhScoreShared";

export function RhScoreDetailDialog({
  canManageScore,
  scoreId,
  onClose,
}: {
  canManageScore: boolean;
  scoreId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useRhScoreDetail(scoreId ?? undefined);

  const updateNitroMutation = useUpdateRhQuarterNitroMutation();

  const [nitroDraft, setNitroDraft] = useState<NitroDraftState>(EMPTY_NITRO_DRAFT);
  const [activeEvaluationType, setActiveEvaluationType] = useState<RhScoreQuestionType | null>(
    null,
  );

  useEffect(() => {
    setNitroDraft(buildNitroDraft(detailQuery.data));
  }, [detailQuery.data, scoreId]);

  async function handleSaveNitroMetric(type: RhNitroMetricType) {
    if (!scoreId) {
      return;
    }

    const rawValue = nitroDraft[type];
    if (rawValue.trim() === "") {
      toast.warn("Informe um valor para a métrica Nitro.");

      return;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      toast.warn("Informe um valor numérico válido para a métrica Nitro.");
      return;
    }

    if (value < RH_NITRO_MIN || value > RH_NITRO_MAX) {
      toast.warn(`Use um valor entre ${RH_NITRO_MIN} e ${RH_NITRO_MAX} para a métrica Nitro.`);
      return;
    }

    try {
      await updateNitroMutation.mutateAsync({
        score_id: scoreId,
        type,
        value,
      });
      toast.success("Nitro atualizado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar o Nitro."));
    }
  }

  const score = detailQuery.data;
  const groupedEvaluations = RH_SCORE_EVALUATION_GROUP_ORDER.map((type) => ({
    type,
    evaluations: score?.evaluations?.filter((evaluation) => evaluation.type === type) ?? [],
  })).filter((group) => group.evaluations.length > 0);

  const activeEvaluationGroup =
    groupedEvaluations.find((group) => group.type === activeEvaluationType) ??
    groupedEvaluations[0] ??
    null;
  useEffect(() => {
    if (!groupedEvaluations.length) {
      if (activeEvaluationType !== null) {
        setActiveEvaluationType(null);
      }
      return;
    }

    if (!activeEvaluationType) {
      setActiveEvaluationType(groupedEvaluations[0].type);
      return;
    }

    const hasActiveType = groupedEvaluations.some((group) => group.type === activeEvaluationType);

    if (!hasActiveType) {
      setActiveEvaluationType(groupedEvaluations[0].type);
    }
  }, [activeEvaluationType, groupedEvaluations]);

  return (
    <Dialog
      open={Boolean(scoreId)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      title="Detalhe do score trimestral"
      description={score ? formatRhQuarterLabel(score.quarter) : "Aguardando dados do trimestre."}
      contentClassName="w-[min(94vw,1040px)]"
      bodyClassName="max-h-[82vh] space-y-5 overflow-y-auto"
    >
      <div className="space-y-6">
        {detailQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando detalhe do trimestre...
          </div>
        ) : detailQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(
              detailQuery.error,
              "Não foi possível carregar o detalhe do trimestre.",
            )}
          </div>
        ) : score ? (
          <>
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 text-white shadow-sm dark:border-slate-700">
              <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/80">
                    Score trimestral
                  </p>

                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <h3 className="text-3xl font-semibold">
                      {formatRhQuarterLabel(score.quarter)}
                    </h3>

                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-blue-100 backdrop-blur">
                      {score.evaluations?.length ?? 0}{" "}
                      {formatRhEvaluationCountLabel(score.evaluations?.length)}
                    </span>
                  </div>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                    Visualize a composição do trimestre, consulte as respostas enviadas e ajuste
                    as métricas de Nitro sem sair do contexto.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/75">
                      Nota final
                    </p>

                    <p className="mt-2 text-3xl font-semibold text-white">
                      {formatRhScoreValue(score.final_score)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/75">
                      Colaborador
                    </p>

                    <p className="mt-2 truncate text-sm font-semibold text-white">
                      {getRhScoreUserSummary(score.user?.name)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/75">
                      Nitro
                    </p>

                    <p className="mt-2 text-sm font-semibold text-white">
                      {score.nitro ? "Nitro vinculado" : "Sem Nitro vinculado"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Eixos de avaliação
                  </h3>

                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Leitura consolidada por categoria.
                  </p>
                </div>

                <Target className="h-5 w-5 text-blue-500 dark:text-blue-300" />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {getRhScoreDetailCategoryRows(score).map((item) => (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <p className="text-sm text-slate-600 dark:text-slate-400">{item.label}</p>

                    <p className="mt-3 text-4xl font-semibold text-slate-900 dark:text-white">
                      {formatRhScoreValue(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Nitro</h3>

                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Métricas trimestrais associadas ao score.
                  </p>
                </div>

                {!canManageScore ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Somente leitura
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {RH_VISIBLE_NITRO_METRICS.map(([type, label]) => (
                  <div
                    key={type}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {getNitroMetricLabel(type, label)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Valor atual: {nitroDraft[type] || "-"}
                        </p>
                      </div>

                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                        Nitro
                      </span>
                    </div>

                    <div className="mt-3 flex items-end gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={nitroDraft[type]}
                        onChange={(event) =>
                          setNitroDraft((current) => ({
                            ...current,
                            [type]: normalizeNitroInput(event.target.value),
                          }))
                        }
                        disabled={!canManageScore}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />

                      {canManageScore ? (
                        <button
                          type="button"
                          onClick={() => handleSaveNitroMetric(type)}
                          disabled={updateNitroMutation.isPending}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          Salvar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Avaliações submetidas
                  </h3>

                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Respostas que já compõem o trimestre.
                  </p>
                </div>

                <Eye className="h-5 w-5 text-blue-500 dark:text-blue-300" />
              </div>

              {score.evaluations?.length ? (
                <div className="mt-5 space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {groupedEvaluations.map((group) => {
                      const isActive = activeEvaluationGroup?.type === group.type;
                      return (
                        <button
                          key={`${group.type}-tab`}
                          type="button"
                          onClick={() => setActiveEvaluationType(group.type)}
                          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/70"
                          }`}
                        >
                          {getRhScoreTypeLabel(group.type)}
                        </button>
                      );
                    })}
                  </div>

                  {groupedEvaluations.map((group) =>
                    activeEvaluationGroup?.type === group.type ? (
                      <div key={group.type} className="space-y-4">
                        <div>
                          <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                            {getRhScoreTypeLabel(group.type)}
                          </h4>
                        </div>

                        <div className="space-y-4">
                          {group.evaluations.map((evaluation) => (
                            <article
                              key={evaluation.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/30"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {evaluation.evaluator?.name?.trim() ||
                                      getRhScoreEvaluatorRoleLabel(evaluation.evaluator_role)}
                                  </p>

                                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                    {getRhScoreStatusLabel(evaluation.status)}
                                  </p>
                                </div>

                                <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                                  Média {formatRhScoreValue(evaluation.average_score)}
                                </span>
                              </div>

                              <div className="mt-4 space-y-3">
                                {evaluation.answers.map((answer) => (
                                  <div
                                    key={`${evaluation.id}-${answer.question_id}`}
                                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                                  >
                                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                      <div>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                                          {getRhScoreQuestionPrompt(
                                            answer.question_text,
                                            answer.question_id,
                                          )}
                                        </p>
                                      </div>

                                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                        Nota {answer.answer}
                                      </span>
                                    </div>

                                    {answer.obs?.trim() ? (
                                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                                        {answer.obs}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                  Nenhuma avaliação submetida para este ciclo.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
