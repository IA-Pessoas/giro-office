import { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  Award,
  ChevronDown,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";

import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@shared/components";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useCreateRhScoreQuestionMutation,
  useDeleteRhScoreQuestionMutation,
  useGenerateRhScoreQuarterMutation,
  useRhScoreQuestions,
  useUpdateRhScoreQuestionMutation,
} from "../hooks/useRhScore";
import type {
  AssignableUser,
  CreateRhScoreQuestionPayload,
  RhScoreQuestion,
  RhScoreQuestionType,
  UpdateRhScoreQuestionPayload,
} from "../types";
import {
  getDefaultRhQuarterValue,
  getRhQuarterOptions,
  getRhScoreQuestionTypeOptions,
  getRhScoreTypeLabel,
} from "../utils/rhScoreUi";

type RhScoreTab = "questions" | "pending" | "history";
type RhScoreQuestionFilter = RhScoreQuestionType | "all";

interface RhScoreQuestionFormState {
  question: string;
  type: RhScoreQuestionType;
}

const SCORE_TAB_META: Record<RhScoreTab, { label: string; description: string }> = {
  history: {
    label: "Histórico",
    description: "O histórico trimestral será conectado na próxima etapa.",
  },
  pending: {
    label: "Pendentes",
    description: "As avaliações pendentes entram na próxima etapa do fluxo.",
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
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
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
    canManageScore ? "questions" : "pending",
  );
  const hasInitializedAdminDefaultTab = useRef(false);

  useEffect(() => {
    if (!canManageScore && activeTab === "questions") {
      setActiveTab("pending");
    }
  }, [activeTab, canManageScore]);

  useEffect(() => {
    if (!canManageScore) {
      setActiveTab((current) => (current === "questions" ? "pending" : current));
    }
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
              Gerencie perguntas, acompanhe o rollout do score trimestral e prepare o
              restante do fluxo sem reaproveitar a interface legada.
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
                : "Perfil com acesso ao score pessoal em evolução."}
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

      {activeTab !== "questions" ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            Fluxo em progresso
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Esta área será concluída nas próximas subetapas da PR.
          </p>
        </div>
      ) : null}
    </div>
  );
}
