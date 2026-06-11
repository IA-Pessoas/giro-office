import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Award,
  ChevronDown,
  Eye,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import { Dialog } from "@shared/components";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { useRhPermissions } from "../hooks/useRhPermissions";
import {
  useCreateRhScoreQuestionMutation,
  useDeleteRhScoreQuestionMutation,
  useGenerateRhScoreQuarterMutation,
  useRhMyScores,
  useRhPendingScoreEvaluations,
  useRhScoreDetail,
  useRhScoreQuestions,
  useSubmitRhScoreEvaluationMutation,
  useUpdateRhQuarterNitroMutation,
  useUpdateRhScoreQuestionMutation,
} from "../hooks/useRhScore";
import type {
  CreateRhScoreQuestionPayload,
  RhNitroMetricType,
  RhPendingScoreEvaluation,
  RhScoreEvaluationAnswer,
  RhScoreQuestion,
  RhScoreQuestionType,
  UpdateRhScoreQuestionPayload,
} from "../types";
import {
  getRhScoreEvaluatorRoleLabel,
  getRhScoreStatusLabel,
  formatRhQuarterLabel,
  formatRhScoreValue,
  getDefaultRhQuarterValue,
  getRhPendingEvaluationTargetName,
  getRhQuarterOptions,
  getRhScoreDetailCategoryRows,
  formatRhEvaluationCountLabel,
  getRhScoreQuestionPrompt,
  getRhScoreQuestionTypeOptions,
  getRhScoreTypeLabel,
  getRhScoreUserSummary,
} from "../utils/rhScoreUi";
import {
  EMPTY_NITRO_DRAFT,
  RH_NITRO_MAX,
  RH_NITRO_MIN,
  RH_SCORE_EVALUATION_GROUP_ORDER,
  RH_VISIBLE_NITRO_METRICS,
  SCORE_TAB_META,
  buildNitroDraft,
  buildQuestionFormState,
  getAssignableUserLabel,
  getErrorMessage,
  getNitroMetricHint,
  getNitroMetricLabel,
  getScoreChoiceClassName,
  normalizeNitroInput,
  type NitroDraftState,
  type RhScoreQuestionFilter,
  type RhScoreQuestionFormState,
  type RhScoreTab,
} from "./score/rhScoreShared";

function QuestionFormDialog({
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
        <span>Pergunta</span>
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

function RhScoreQuarterGenerationPanel({ canManageScore }: { canManageScore: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState(getDefaultRhQuarterValue);
  const quarterOptions = useMemo(() => getRhQuarterOptions(), []);
  const assignableUsersQuery = useAssignableUsers({ enabled: canManageScore });
  const generateQuarterMutation = useGenerateRhScoreQuarterMutation();

  const assignableUsers = assignableUsersQuery.data ?? [];

  async function handleGenerateQuarter() {
    if (!selectedUserId) {
      toast.warn("Selecione o colaborador para gerar o trimestre.");
      return;
    }

    if (!selectedQuarter) {
      toast.warn("Selecione o trimestre.");
      return;
    }

    try {
      await generateQuarterMutation.mutateAsync({
        target_user_id: selectedUserId,
        quarter: selectedQuarter,
      });
      toast.success("Trimestre gerado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível gerar o trimestre."));
    }
  }
  return (
    <aside className="h-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <FilePlus2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Gerar trimestre</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Gere o score trimestral para um colaborador.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Colaborador</span>
          <div className="relative">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              disabled={assignableUsersQuery.isLoading || assignableUsersQuery.isError}
            >
              <option value="">Selecione</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {getAssignableUserLabel(user)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Trimestre</span>
          <div className="relative">
            <select
              value={selectedQuarter}
              onChange={(event) => setSelectedQuarter(event.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {quarterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        {assignableUsersQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(
              assignableUsersQuery.error,
              "Não foi possível carregar os colaboradores disponíveis.",
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleGenerateQuarter}
          disabled={generateQuarterMutation.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generateQuarterMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Target className="h-4 w-4" />
          )}
          {generateQuarterMutation.isPending ? "Gerando..." : "Gerar score trimestral"}
        </button>
      </div>
    </aside>
  );
}

function RhScoreQuestionsTab({ canManageScore }: { canManageScore: boolean }) {
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
      <QuestionFormDialog
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

function RhPendingEvaluationsTab() {
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
      <Dialog
        open={Boolean(selectedEvaluation)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedEvaluation(null);
          }
        }}
        title="Submeter avaliação"
        description={
          selectedEvaluation
            ? `${getRhPendingEvaluationTargetName(selectedEvaluation)} - ${formatRhQuarterLabel(
                selectedEvaluation.scoreQuarter.quarter,
              )}`
            : "Preencha as respostas do trimestre."
        }
        contentClassName="w-[min(94vw,960px)]"
        bodyClassName="max-h-[80vh] space-y-5 overflow-y-auto"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelectedEvaluation(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSubmitEvaluation}
              disabled={submitMutation.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitMutation.isPending ? "Enviando..." : "Enviar avaliação"}
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
                {selectedEvaluation ? getRhPendingEvaluationTargetName(selectedEvaluation) : "-"}
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
                  {selectedEvaluation
                    ? formatRhQuarterLabel(selectedEvaluation.scoreQuarter.quarter)
                    : "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/80">Tipo</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {selectedEvaluation ? getRhScoreTypeLabel(selectedEvaluation.type) : "-"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100/80">Papel</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {getRhScoreEvaluatorRoleLabel(selectedEvaluation?.evaluator_role)}
                </p>
              </div>
            </div>
          </div>
        </section>
        <div className="space-y-4">
          {selectedEvaluation
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
                              onClick={() => updateAnswer(answer.question_id, scoreValue)}
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
                          updateObservation(answer.question_id, event.target.value)
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
    </>
  );
}

function RhScoreDetailDialog({
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

function RhScoreHistoryTab({ canManageScore }: { canManageScore: boolean }) {
  const historyQuery = useRhMyScores();

  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const scoreHistory = historyQuery.data ?? [];
  const scoreHistory2026 = useMemo(
    () =>
      [...scoreHistory]
        .filter((score) => score.quarter?.startsWith("2026-Q"))
        .sort((left, right) => left.quarter.localeCompare(right.quarter)),
    [scoreHistory],
  );

  return (
    <>
      {historyQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-14 text-sm text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico trimestral...
        </div>
      ) : historyQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(
            historyQuery.error,
            "Não foi possível carregar o histórico trimestral.",
          )}
        </div>
      ) : scoreHistory2026.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Eye className="h-5 w-5" />
          </div>

          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            {"Histórico indisponível"}
          </h3>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Seus trimestres de 2026 aparecerão aqui assim que forem gerados.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            scoreHistory2026.length >= 3 ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {scoreHistory2026.map((score) => (
            <article
              key={score.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
                    {formatRhQuarterLabel(score.quarter)}
                  </p>

                  <h3 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    Score final {formatRhScoreValue(score.final_score)}
                  </h3>

                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {score.evaluations?.length ?? 0}{" "}
                    {formatRhEvaluationCountLabel(score.evaluations?.length, "registered")}
                  </p>
                </div>

                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {score.nitro ? "Nitro vinculado" : "Sem Nitro"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {getRhScoreDetailCategoryRows(score).map((item) => (
                  <div key={item.key} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {item.label}
                    </p>

                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                      {formatRhScoreValue(item.value)}
                    </p>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSelectedScoreId(score.id)}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Eye className="h-4 w-4" />
                Ver detalhe do trimestre
              </button>
            </article>
          ))}
        </div>
      )}

      <RhScoreDetailDialog
        canManageScore={canManageScore}
        scoreId={selectedScoreId}
        onClose={() => setSelectedScoreId(null)}
      />
    </>
  );
}
export function RhScoreSection() {
  const { canManageRhScore, permissionQuery } = useRhPermissions("score");
  const canManageScore = canManageRhScore;
  const [activeTab, setActiveTab] = useState<RhScoreTab>(canManageScore ? "questions" : "pending");

  const hasInitializedAdminDefaultTab = useRef(false);

  useEffect(() => {
    if (!canManageScore && activeTab === "questions") {
      setActiveTab("pending");
    }
  }, [activeTab, canManageScore]);

  useEffect(() => {
    if (canManageScore || hasInitializedAdminDefaultTab.current) {
      return;
    }
    setActiveTab("pending");
  }, [canManageScore]);

  useEffect(() => {
    if (!canManageScore || hasInitializedAdminDefaultTab.current) {
      return;
    }
    setActiveTab("questions");
    hasInitializedAdminDefaultTab.current = true;
  }, [canManageScore]);

  const availableTabs = canManageScore
    ? (["questions", "pending", "history"] as RhScoreTab[])
    : (["pending", "history"] as RhScoreTab[]);

  const showQuarterGenerationPanel = canManageScore && activeTab === "questions";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {"Avaliações de score"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {"Perguntas, pendências e histórico trimestral."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {availableTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {SCORE_TAB_META[tab].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {permissionQuery.error ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          {getErrorMessage(permissionQuery.error, "Não foi possível validar o acesso ao score agora.")}
        </div>
      ) : null}

      {activeTab === "questions" && canManageScore ? (
        <RhScoreQuestionsTab canManageScore={canManageScore} />
      ) : null}

      {activeTab === "pending" ? <RhPendingEvaluationsTab /> : null}

      {activeTab === "history" ? <RhScoreHistoryTab canManageScore={canManageScore} /> : null}

      {!canManageScore && activeTab === "questions" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Esse painel está disponível só para a gestão do RH.
          </div>
        </div>
      ) : null}
    </div>
  );
}
