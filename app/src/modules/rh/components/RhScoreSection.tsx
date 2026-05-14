import { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
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

import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@shared/components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/newLayout/sheet";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
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
  AssignableUser,
  CreateRhScoreQuestionPayload,
  RhNitroMetricType,
  RhPendingScoreEvaluation,
  RhScoreEvaluationAnswer,
  RhScoreQuestion,
  RhScoreQuestionType,
  RhScoreQuarter,
  UpdateRhScoreQuestionPayload,
} from "../types";
import {
  formatRhQuarterLabel,
  formatRhScoreValue,
  getDefaultRhQuarterValue,
  getRhPendingEvaluationTargetName,
  getRhQuarterOptions,
  getRhScoreDetailCategoryRows,
  getRhScoreQuestionTypeOptions,
  getRhScoreTypeLabel,
} from "../utils/rhScoreUi";

type RhScoreTab = "questions" | "pending" | "history";
type RhScoreQuestionFilter = RhScoreQuestionType | "all";

interface RhScoreQuestionFormState {
  question: string;
  type: RhScoreQuestionType;
}

interface NitroDraftState {
  projects: string;
  hours: string;
  errors: string;
  folders: string;
}

const SCORE_TAB_META: Record<RhScoreTab, { label: string; description: string }> = {
  history: {
    label: "Histórico",
    description: "Acompanhe seus ciclos trimestrais e o detalhamento das avaliações.",
  },
  pending: {
    label: "Pendentes",
    description: "Responda as avaliações atribuídas ao seu perfil.",
  },
  questions: {
    label: "Perguntas",
    description: "Gerencie perguntas de score e gere trimestres para colaboradores.",
  },
};

const DEFAULT_QUESTION_FORM_STATE: RhScoreQuestionFormState = {
  question: "",
  type: "behavioral",
};

const EMPTY_NITRO_DRAFT: NitroDraftState = {
  projects: "",
  hours: "",
  errors: "",
  folders: "",
};

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (isAxiosError(error)) {
    return (
      error.response?.data?.error ??
      error.response?.data?.message ??
      error.message ??
      fallbackMessage
    );
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

function buildQuestionFormState(question: RhScoreQuestion | null): RhScoreQuestionFormState {
  if (!question) {
    return DEFAULT_QUESTION_FORM_STATE;
  }

  return {
    question: question.question,
    type: question.type === "tech" ? "technical" : question.type,
  };
}

function buildNitroDraft(score: RhScoreQuarter | undefined): NitroDraftState {
  return {
    projects: score?.nitro?.projects_score?.toString() ?? "",
    hours: score?.nitro?.hours_score?.toString() ?? "",
    errors: score?.nitro?.errors_score?.toString() ?? "",
    folders: score?.nitro?.folders_score?.toString() ?? "",
  };
}

function getAssignableUserLabel(user: AssignableUser) {
  const parts = [user.name.trim()];

  if (user.departmentName) {
    parts.push(user.departmentName);
  }

  return parts.join(" - ");
}

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

function RhScoreQuestionsTab() {
  const [selectedType, setSelectedType] = useState<RhScoreQuestionFilter>("all");
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<RhScoreQuestion | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState(getDefaultRhQuarterValue);

  const questionsQuery = useRhScoreQuestions({
    all: true,
    type: selectedType === "all" ? undefined : selectedType,
  });
  const assignableUsersQuery = useAssignableUsers({ enabled: true });
  const updateMutation = useUpdateRhScoreQuestionMutation();
  const deleteMutation = useDeleteRhScoreQuestionMutation();
  const generateQuarterMutation = useGenerateRhScoreQuarterMutation();

  const questions = questionsQuery.data ?? [];
  const assignableUsers = assignableUsersQuery.data ?? [];
  const isGenerating = generateQuarterMutation.isPending;

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
        question.active
          ? "Pergunta desativada com sucesso."
          : "Pergunta ativada com sucesso.",
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
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Perguntas de score
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Conectado ao CRUD real de perguntas do score trimestral.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-[220px]">
                <select
                  value={selectedType}
                  onChange={(event) =>
                    setSelectedType(event.target.value as RhScoreQuestionFilter)
                  }
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

              <button
                type="button"
                onClick={handleNewQuestion}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Nova pergunta
              </button>
            </div>
          </div>

          {questionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando perguntas...
            </div>
          ) : questionsQuery.error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {getErrorMessage(
                questionsQuery.error,
                "Não foi possível carregar as perguntas de score.",
              )}
            </div>
          ) : questions.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
              Nenhuma pergunta encontrada para o filtro selecionado.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
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
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            question.active
                              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
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
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
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
        </section>

        <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Gerar trimestre
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Crie o score trimestral para um colaborador usando o formato confirmado
                `YYYY-QN`.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
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
                  {getRhQuarterOptions().map((option) => (
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
              disabled={isGenerating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              {isGenerating ? "Gerando..." : "Gerar score trimestral"}
            </button>
          </div>
        </aside>
      </div>

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
  const [selectedEvaluation, setSelectedEvaluation] = useState<RhPendingScoreEvaluation | null>(null);
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

    const hasInvalidAnswer = answers.some((answer) => !Number.isFinite(answer.answer) || answer.answer < 1);
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
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
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
                    {getRhScoreTypeLabel(evaluation.type)} • {evaluation.evaluator_role}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  {evaluation.status}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Perguntas
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {evaluation.answers.length}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
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
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Award className="h-4 w-4" />
                Responder avaliação
              </button>
            </article>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(selectedEvaluation)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedEvaluation(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto bg-white sm:max-w-2xl">
          <SheetHeader className="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
            <SheetTitle className="text-lg text-gray-900 dark:text-white">
              Submeter avaliação
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-600 dark:text-gray-400">
              {selectedEvaluation
                ? `${getRhPendingEvaluationTargetName(selectedEvaluation)} • ${formatRhQuarterLabel(
                    selectedEvaluation.scoreQuarter.quarter,
                  )}`
                : "Preencha as respostas do trimestre."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-6 py-5">
            {selectedEvaluation ? (
              answers.map((answer, index) => (
                <div
                  key={answer.question_id}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                      Pergunta {index + 1}
                    </span>
                    <p className="text-sm font-medium leading-6 text-gray-900 dark:text-white">
                      {answer.question_text?.trim() || answer.question_id}
                    </p>
                  </div>

                  <label className="mt-4 flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span>Nota</span>
                    <div className="relative">
                      <select
                        value={answer.answer || ""}
                        onChange={(event) =>
                          updateAnswer(answer.question_id, Number(event.target.value))
                        }
                        className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">Selecione uma nota</option>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                  </label>

                  <label className="mt-4 flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span>Observação</span>
                    <textarea
                      rows={3}
                      value={answer.obs ?? ""}
                      onChange={(event) =>
                        updateObservation(answer.question_id, event.target.value)
                      }
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="Comentário adicional opcional"
                    />
                  </label>
                </div>
              ))
            ) : null}
          </div>

          <SheetFooter className="border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
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
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RhScoreDetailSheet({
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

  return (
    <Sheet
      open={Boolean(scoreId)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto bg-white sm:max-w-3xl">
        <SheetHeader className="border-b border-gray-200 px-6 py-5 dark:border-gray-700">
          <SheetTitle className="text-lg text-gray-900 dark:text-white">
            Detalhe do score trimestral
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-600 dark:text-gray-400">
            {score ? formatRhQuarterLabel(score.quarter) : "Aguardando dados do trimestre."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-5">
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
              <section className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Trimestre
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {formatRhQuarterLabel(score.quarter)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Nota final
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {formatRhScoreValue(score.final_score)}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Avaliações
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {score.evaluations?.length ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    User ID
                  </p>
                  <p className="mt-2 truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {score.user_id}
                  </p>
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Eixos de avaliação
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {getRhScoreDetailCategoryRows(score).map((item) => (
                    <div
                      key={item.key}
                      className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50"
                    >
                      <p className="text-sm text-gray-600 dark:text-gray-400">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                        {formatRhScoreValue(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Nitro
                    </h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Métricas trimestrais associadas ao score.
                    </p>
                  </div>
                  {!canManageScore ? (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      Somente leitura
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {([
                    ["projects", "Projetos"],
                    ["hours", "Horas"],
                    ["errors", "Erros"],
                    ["folders", "Pastas"],
                  ] as Array<[RhNitroMetricType, string]>).map(([type, label]) => (
                    <div
                      key={type}
                      className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {label}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Atual: {nitroDraft[type] || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-3">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={nitroDraft[type]}
                          onChange={(event) =>
                            setNitroDraft((current) => ({
                              ...current,
                              [type]: event.target.value,
                            }))
                          }
                          disabled={!canManageScore}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                        {canManageScore ? (
                          <button
                            type="button"
                            onClick={() => handleSaveNitroMetric(type)}
                            disabled={updateNitroMutation.isPending}
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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

              <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Avaliações submetidas
                </h3>
                {score.evaluations?.length ? (
                  <div className="mt-4 space-y-4">
                    {score.evaluations.map((evaluation) => (
                      <article
                        key={evaluation.id}
                        className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {getRhScoreTypeLabel(evaluation.type)}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                              {evaluation.evaluator?.name?.trim() || evaluation.evaluator_role} •{" "}
                              {evaluation.status}
                            </p>
                          </div>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            Média {formatRhScoreValue(evaluation.average_score)}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {evaluation.answers.map((answer) => (
                            <div
                              key={`${evaluation.id}-${answer.question_id}`}
                              className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50"
                            >
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {answer.question_text?.trim() || answer.question_id}
                              </p>
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                Nota: {answer.answer}
                              </p>
                              {answer.obs?.trim() ? (
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                  {answer.obs}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                    Nenhuma avaliação submetida para este trimestre.
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RhScoreHistoryTab({ canManageScore }: { canManageScore: boolean }) {
  const historyQuery = useRhMyScores();
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);
  const scoreHistory = historyQuery.data ?? [];

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
      ) : scoreHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Eye className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            Histórico indisponível
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Seus trimestres aparecerão aqui assim que forem gerados.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {scoreHistory.map((score) => (
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
                    {score.evaluations?.length ?? 0} avaliação(ões) registradas
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  {score.nitro ? "Nitro ativo" : "Sem Nitro"}
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
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Eye className="h-4 w-4" />
                Ver detalhe do trimestre
              </button>
            </article>
          ))}
        </div>
      )}

      <RhScoreDetailSheet
        canManageScore={canManageScore}
        scoreId={selectedScoreId}
        onClose={() => setSelectedScoreId(null)}
      />
    </>
  );
}

export function RhScoreSection() {
  const { user } = useAuth();
  const permissionQuery = useFetch(
    ["rh", "score", "permissions", user?.id ?? ""],
    () => permissionService.getByUserId(user?.id ?? ""),
    {
      enabled: Boolean(user?.id),
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const normalizedPermissions = useMemo(() => {
    if (!permissionQuery.data) {
      return null;
    }

    return normalizePermissionResponse(permissionQuery.data).known;
  }, [permissionQuery.data]);

  const isRhResponsible = Boolean(
    normalizedPermissions?.rh !== null &&
      normalizedPermissions?.rh !== undefined &&
      normalizedPermissions.rh >= 1,
  );
  const isGlobalAdmin = user?.permission === 2;
  const canManageScore = isRhResponsible || isGlobalAdmin;
  const [activeTab, setActiveTab] = useState<RhScoreTab>(
    canManageScore ? "questions" : "history",
  );
  const hasInitializedAdminDefaultTab = useRef(false);

  useEffect(() => {
    if (!canManageScore && activeTab === "questions") {
      setActiveTab("history");
    }
  }, [activeTab, canManageScore]);

  useEffect(() => {
    if (canManageScore) {
      return;
    }

    setActiveTab((current) => (current === "questions" ? "history" : current));
  }, [canManageScore]);

  useEffect(() => {
    if (!canManageScore || hasInitializedAdminDefaultTab.current) {
      return;
    }

    setActiveTab("questions");
    hasInitializedAdminDefaultTab.current = true;
  }, [canManageScore]);

  const availableTabs = canManageScore
    ? (["questions", "history"] as RhScoreTab[])
    : (["history"] as RhScoreTab[]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <Award className="h-3.5 w-3.5" />
              Score & Reviews
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
              Avaliações conectadas ao fluxo real do RH
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              Gerencie perguntas, acompanhe pendências, consulte seu histórico
              trimestral e detalhe o score sem reaproveitar a interface legada.
            </p>
          </div>

          {permissionQuery.error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              {getErrorMessage(
                permissionQuery.error,
                "Não foi possível validar as permissões do score. O backend continuará como fonte de verdade.",
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
              {canManageScore
                ? "Perfil com acesso administrativo ao score."
                : "Perfil com acesso a pendências e histórico pessoal."}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
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

        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
          {SCORE_TAB_META[activeTab].description}
        </div>
      </section>

      {activeTab === "questions" && canManageScore ? <RhScoreQuestionsTab /> : null}
      {activeTab === "pending" ? null : null}
      {activeTab === "history" ? <RhScoreHistoryTab canManageScore={false} /> : null}

      {!canManageScore && activeTab === "questions" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Ações administrativas de score estão disponíveis apenas para RH e admins.
          </div>
        </div>
      ) : null}
    </div>
  );
}
