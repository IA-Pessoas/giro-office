import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Plus,
  Send,
  Tags,
  Ticket,
  UserPlus,
} from "lucide-react";

import { Dialog } from "@shared/components";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useAssignTiRequest,
  useCreateTiRequest,
  useCreateTiRequestCategory,
  useCreateTiRequestMessage,
  useTiRequest,
  useTiRequestCategories,
  useTiRequestMessages,
  useTiRequests,
  useUpdateTiRequest,
  useUpdateTiRequestCategory,
  useUpdateTiRequestStatus,
} from "../hooks";
import type { TiId, TiListFilters, TiRequest, TiRequestCategory } from "../types";
import { TiNativeSelect } from "./TiNativeSelect";
import { TiEmptyState, TiIconAction, TiPanel, TiSectionHeader } from "./tiFormControls";
import {
  tiInputClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

const REQUEST_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "open", label: "Aberto" },
  { value: "in_progress", label: "Em atendimento" },
  { value: "resolved", label: "Resolvido" },
  { value: "closed", label: "Fechado" },
] as const;

const REQUEST_PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
] as const;

const REQUEST_STATUS_ACTIONS = REQUEST_STATUS_OPTIONS.filter((option) => option.value);

type RequestDraft = {
  title: string;
  description: string;
  category_id: string;
  priority: string;
};

type CategoryDraft = {
  name: string;
};

const INITIAL_REQUEST_DRAFT: RequestDraft = {
  title: "",
  description: "",
  category_id: "",
  priority: "medium",
};

const INITIAL_CATEGORY_DRAFT: CategoryDraft = {
  name: "",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Não foi possível concluir a ação. Tente novamente.";
}

function getStringField(record: Record<string, unknown>, keys: string[], fallback = "-"): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return fallback;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getStatusBadgeConfig(status: unknown): StatusBadgeConfig {
  const normalizedStatus = typeof status === "string" ? status : "";

  switch (normalizedStatus) {
    case "open":
      return { label: "Aberto", variant: "info" };
    case "in_progress":
      return { label: "Em atendimento", variant: "warning" };
    case "resolved":
      return { label: "Resolvido", variant: "success" };
    case "closed":
      return { label: "Fechado", variant: "neutral" };
    default:
      return { label: normalizedStatus || "Sem status", variant: "neutral" };
  }
}

function getPriorityLabel(priority: unknown): string {
  const option = REQUEST_PRIORITY_OPTIONS.find((item) => item.value === priority);

  if (option) {
    return option.label;
  }

  return typeof priority === "string" && priority ? priority : "-";
}

function getRequestTitle(request: TiRequest): string {
  return request.title ?? getStringField(request, ["subject", "name"], "Chamado sem título");
}

function getCategoryName(category: TiRequestCategory): string {
  return category.name ?? `Categoria ${category.id}`;
}

function isCategoryActive(category: TiRequestCategory): boolean {
  if (typeof category.active === "boolean") {
    return category.active;
  }

  if (typeof category.status === "boolean") {
    return category.status;
  }

  if (typeof category.status === "string") {
    return !["inactive", "inativo", "false"].includes(category.status.toLowerCase());
  }

  return true;
}

function getCategoryLabel(
  request: TiRequest,
  categoriesById: Map<string, TiRequestCategory>,
): string {
  if (request.category_name) {
    return request.category_name;
  }

  const categoryId = request.category_id;

  if (categoryId !== undefined && categoryId !== null) {
    const category = categoriesById.get(String(categoryId));

    if (category?.name) {
      return getCategoryName(category);
    }
  }

  return "-";
}

export function TiRequestsTab() {
  const [filters, setFilters] = useState<TiListFilters>({ search: "", status: "" });
  const [selectedRequestId, setSelectedRequestId] = useState<TiId | undefined>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(INITIAL_REQUEST_DRAFT);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(INITIAL_CATEGORY_DRAFT);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const requestsQuery = useTiRequests(filters);
  const categoriesQuery = useTiRequestCategories();
  const requests = requestsQuery.data ?? [];
  const selectedRequest = requests.find((request) => request.id === selectedRequestId);
  const activeRequestId = selectedRequestId ?? requests[0]?.id;
  const requestDetailQuery = useTiRequest(activeRequestId);
  const messagesQuery = useTiRequestMessages(activeRequestId);
  const activeRequest = requestDetailQuery.data ?? selectedRequest;
  const categories = categoriesQuery.data ?? [];
  const activeCategories = categories.filter(isCategoryActive);

  const createRequestMutation = useCreateTiRequest();
  const updateRequestMutation = useUpdateTiRequest();
  const assignRequestMutation = useAssignTiRequest();
  const updateStatusMutation = useUpdateTiRequestStatus();
  const createMessageMutation = useCreateTiRequestMessage();
  const createCategoryMutation = useCreateTiRequestCategory();
  const updateCategoryMutation = useUpdateTiRequestCategory();

  const categoriesById = useMemo(() => {
    return new Map(
      categories.map((category) => [String(category.id), category] as const),
    );
  }, [categories]);

  const categoryOptions = useMemo(() => {
    return [
      { value: "", label: "Todas" },
      ...categories.map((category) => ({
        value: String(category.id),
        label: getCategoryName(category),
      })),
    ];
  }, [categories]);

  const createCategoryOptions = useMemo(() => {
    return [
      { value: "", label: "Sem categoria" },
      ...activeCategories.map((category) => ({
        value: String(category.id),
        label: getCategoryName(category),
      })),
    ];
  }, [activeCategories]);

  const isRequestsLoading = requestsQuery.isLoading || requestsQuery.isFetching;
  const isDetailLoading = requestDetailQuery.isLoading || requestDetailQuery.isFetching;
  const isMessagesLoading = messagesQuery.isLoading || messagesQuery.isFetching;
  const isSaving =
    createRequestMutation.isPending ||
    updateRequestMutation.isPending ||
    assignRequestMutation.isPending ||
    updateStatusMutation.isPending ||
    createMessageMutation.isPending;
  const isCategorySaving = createCategoryMutation.isPending || updateCategoryMutation.isPending;

  function handleCloseCreateDialog() {
    setIsCreateDialogOpen(false);
    setCreateFormError(null);
    setRequestDraft(INITIAL_REQUEST_DRAFT);
  }

  function handleCloseCategoryDialog() {
    setIsCategoryDialogOpen(false);
    setCategoryFormError(null);
    setCategoryDraft(INITIAL_CATEGORY_DRAFT);
  }

  async function handleSubmitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryFormError(null);

    const name = categoryDraft.name.trim();

    if (!name) {
      setCategoryFormError("Informe o nome da categoria.");
      return;
    }

    try {
      await createCategoryMutation.mutateAsync({ name });
      setCategoryDraft(INITIAL_CATEGORY_DRAFT);
    } catch (error) {
      setCategoryFormError(getErrorMessage(error));
    }
  }

  async function handleToggleCategory(category: TiRequestCategory) {
    setCategoryFormError(null);

    try {
      await updateCategoryMutation.mutateAsync({
        id: category.id,
        payload: {
          active: !isCategoryActive(category),
        },
      });

    } catch (error) {
      setCategoryFormError(getErrorMessage(error));
    }
  }

  async function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateFormError(null);

    if (!requestDraft.title.trim()) {
      setCreateFormError("Informe um título para criar o chamado.");
      return;
    }

    try {
      const createdRequest = await createRequestMutation.mutateAsync({
        title: requestDraft.title.trim(),
        description: requestDraft.description.trim() || null,
        category_id: requestDraft.category_id || null,
        priority: requestDraft.priority,
      });

      setSelectedRequestId(createdRequest.id);
      handleCloseCreateDialog();
    } catch (error) {
      setCreateFormError(getErrorMessage(error));
    }
  }

  async function handleAssignRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!activeRequestId || !assignedUserId.trim()) {
      setActionError("Informe o usuário responsável.");
      return;
    }

    try {
      await assignRequestMutation.mutateAsync({
        id: activeRequestId,
        payload: {
          assigned_to_id: assignedUserId.trim(),
        },
      });
      setAssignedUserId("");
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleUpdateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!activeRequestId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = formData.get("title")?.toString().trim() ?? "";

    if (!title) {
      setActionError("Informe um título para salvar o chamado.");
      return;
    }

    try {
      await updateRequestMutation.mutateAsync({
        id: activeRequestId,
        payload: {
          title,
          description: formData.get("description")?.toString().trim() || null,
          category_id: formData.get("category_id")?.toString() || null,
          priority: formData.get("priority")?.toString() || null,
        },
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleUpdateStatus(status: string) {
    setActionError(null);

    if (!activeRequestId) {
      return;
    }

    try {
      await updateStatusMutation.mutateAsync({
        id: activeRequestId,
        payload: { status },
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!activeRequestId || !messageDraft.trim()) {
      setActionError("Escreva uma mensagem antes de enviar.");
      return;
    }

    try {
      await createMessageMutation.mutateAsync({
        id: activeRequestId,
        payload: { message: messageDraft.trim() },
      });
      setMessageDraft("");
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Chamados"
        description="Gerencie solicitações, responsáveis, status e conversas do atendimento."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <TiIconAction
              icon={Tags}
              label="Categorias"
              disabled={isCategorySaving}
              onClick={() => {
                setCategoryFormError(null);
                setIsCategoryDialogOpen(true);
              }}
            />
            <TiIconAction
              icon={Plus}
              label={createRequestMutation.isPending ? "Criando..." : "Novo chamado"}
              variant="primary"
              disabled={createRequestMutation.isPending}
              onClick={() => {
                setCreateFormError(null);
                setIsCreateDialogOpen(true);
              }}
            />
          </div>
        }
      />

      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseCategoryDialog();
          }
        }}
        title="Categorias de chamados"
        description="Gerencie as categorias usadas na triagem dos chamados."
        contentClassName="w-[min(94vw,820px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        <div className="space-y-5">
          {categoryFormError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {categoryFormError}
            </div>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                  Adicionar categoria
                </h3>
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Categorias ativas ficam disponíveis nos chamados.
                </p>
              </div>
            </div>

            <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleSubmitCategory}>
              <label className="flex min-w-0 flex-col gap-2">
                <span className={tiLabelClassName}>Nome</span>
                <input
                  className={tiInputClassName}
                  value={categoryDraft.name}
                  placeholder="Ex.: Infraestrutura"
                  onChange={(event) =>
                    setCategoryDraft((currentDraft) => ({
                      ...currentDraft,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="flex flex-col justify-end gap-3">
                <button
                  type="submit"
                  className={tiPrimaryButtonClassName}
                  disabled={isCategorySaving}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isCategorySaving ? "Salvando..." : "Criar categoria"}</span>
                </button>
              </div>
            </form>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                Categorias cadastradas
              </h3>
              {categoriesQuery.isFetching ? (
                <span className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Atualizando
                </span>
              ) : null}
            </div>

            {categoriesQuery.isError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                Não foi possível carregar as categorias.
              </div>
            ) : null}

            {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                Nenhuma categoria cadastrada.
              </div>
            ) : null}

            <div className="space-y-2">
              {categories.map((category) => {
                const isActive = isCategoryActive(category);

                return (
                  <div
                    key={category.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-950 dark:text-white">
                          {getCategoryName(category)}
                        </span>
                        <StatusBadge
                          config={{
                            label: isActive ? "Ativa" : "Inativa",
                            variant: isActive ? "success" : "neutral",
                          }}
                          size="sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={tiSecondaryButtonClassName}
                        disabled={isCategorySaving}
                        onClick={() => void handleToggleCategory(category)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isActive ? "Inativar" : "Ativar"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </Dialog>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseCreateDialog();
          }
        }}
        title="Novo chamado"
        description="Registre a solicitação inicial para abrir o atendimento."
        contentClassName="w-[min(94vw,860px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
      >
        <form className="space-y-4" onSubmit={handleCreateRequest}>
          {createFormError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {createFormError}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-2 md:col-span-2">
              <span className={tiLabelClassName}>Título</span>
              <input
                id="ti-request-title"
                className={tiInputClassName}
                value={requestDraft.title}
                placeholder="Ex.: Notebook sem acesso à rede"
                onChange={(event) =>
                  setRequestDraft((currentDraft) => ({
                    ...currentDraft,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <TiNativeSelect
              label="Categoria"
              value={requestDraft.category_id}
              options={createCategoryOptions}
              onChange={(event) =>
                setRequestDraft((currentDraft) => ({
                  ...currentDraft,
                  category_id: event.target.value,
                }))
              }
            />
            <TiNativeSelect
              label="Prioridade"
              value={requestDraft.priority}
              options={REQUEST_PRIORITY_OPTIONS}
              onChange={(event) =>
                setRequestDraft((currentDraft) => ({
                  ...currentDraft,
                  priority: event.target.value,
                }))
              }
            />
            <label className="flex min-w-0 flex-col gap-2 md:col-span-2">
              <span className={tiLabelClassName}>Descrição</span>
              <textarea
                className={cn(tiInputClassName, "h-auto min-h-24 py-2")}
                value={requestDraft.description}
                placeholder="Descreva o problema ou solicitação."
                onChange={(event) =>
                  setRequestDraft((currentDraft) => ({
                    ...currentDraft,
                    description: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={tiSecondaryButtonClassName}
              disabled={createRequestMutation.isPending}
              onClick={handleCloseCreateDialog}
            >
              <span>Cancelar</span>
            </button>
            <button
              type="submit"
              className={tiPrimaryButtonClassName}
              disabled={createRequestMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              <span>{createRequestMutation.isPending ? "Criando..." : "Criar chamado"}</span>
            </button>
          </div>
        </form>
      </Dialog>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 md:grid-cols-[minmax(320px,1fr)_180px_220px] lg:grid-cols-[minmax(420px,1fr)_180px_220px]">
            <label className="flex min-w-0 flex-col gap-2">
              <span className={tiLabelClassName}>Busca</span>
              <input
                className={tiInputClassName}
                value={String(filters.search ?? "")}
                placeholder="Título, solicitante ou descrição"
                onChange={(event) =>
                  setFilters((currentFilters) => ({
                    ...currentFilters,
                    search: event.target.value,
                  }))
                }
              />
            </label>
            <TiNativeSelect
              label="Status"
              value={String(filters.status ?? "")}
              options={REQUEST_STATUS_OPTIONS}
              onChange={(event) =>
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status: event.target.value,
                }))
              }
            />
            <TiNativeSelect
              label="Categoria"
              value={String(filters.category_id ?? "")}
              options={categoryOptions}
              onChange={(event) =>
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  category_id: event.target.value,
                }))
              }
            />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          {requestsQuery.isError ? (
            <TiEmptyState
              icon={AlertCircle}
              title="Não foi possível carregar os chamados"
              description="Tente atualizar os filtros ou abrir a aba novamente em instantes."
            />
          ) : null}

          {isRequestsLoading ? (
            <TiEmptyState
              icon={Ticket}
              title="Carregando chamados"
              description="Buscando a fila de atendimento de Tecnologia."
            />
          ) : null}

          {!isRequestsLoading && !requestsQuery.isError && requests.length === 0 ? (
            <TiEmptyState
              icon={Ticket}
              title="Nenhum chamado encontrado"
              description="A fila de atendimento aparece aqui assim que houver chamados registrados."
            />
          ) : null}

          {!isRequestsLoading && !requestsQuery.isError && requests.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Chamado</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Prioridade</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Criado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {requests.map((request) => {
                      const isSelected = request.id === activeRequestId;

                      return (
                        <tr
                          key={request.id}
                          className={cn(
                            "cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70",
                            isSelected ? "bg-blue-50 dark:bg-blue-950/30" : null,
                          )}
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <td className="min-w-64 px-4 py-3">
                            <span className="block font-medium text-slate-950 dark:text-white">
                              {getRequestTitle(request)}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {request.requester_name ??
                                getStringField(request, ["requester", "created_by"], "Sem solicitante")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {getCategoryLabel(request, categoriesById)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {getPriorityLabel(request.priority)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge config={getStatusBadgeConfig(request.status)} size="sm" />
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {formatDate(request.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <aside className={cn("space-y-4", !activeRequestId ? "lg:self-end" : null)}>
          {actionError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {actionError}
            </div>
          ) : null}

          {!activeRequestId ? (
            <TiEmptyState
              icon={MessageSquare}
              title="Selecione um chamado"
              description="O detalhe, as conversas e as ações do atendimento aparecem neste painel."
            />
          ) : null}

          {activeRequestId ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {isDetailLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Carregando detalhe...</p>
              ) : null}

              {requestDetailQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-300">
                  Não foi possível carregar o detalhe do chamado.
                </p>
              ) : null}

              {activeRequest ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                        {getRequestTitle(activeRequest)}
                      </h3>
                      <StatusBadge config={getStatusBadgeConfig(activeRequest.status)} size="sm" />
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {activeRequest.description ??
                        getStringField(activeRequest, ["body", "details"], "Sem descrição.")}
                    </p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className={tiLabelClassName}>Categoria</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {getCategoryLabel(activeRequest, categoriesById)}
                      </dd>
                    </div>
                    <div>
                      <dt className={tiLabelClassName}>Responsavel</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {activeRequest.assigned_to_name ??
                          getStringField(activeRequest, ["assigned_to", "responsible"], "Sem responsável")}
                      </dd>
                    </div>
                    <div>
                      <dt className={tiLabelClassName}>Prioridade</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {getPriorityLabel(activeRequest.priority)}
                      </dd>
                    </div>
                    <div>
                      <dt className={tiLabelClassName}>Atualizado em</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {formatDate(activeRequest.updated_at)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    key={`edit-${activeRequest.id}`}
                    className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                    onSubmit={handleUpdateRequest}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                        <span className={tiLabelClassName}>Editar título</span>
                        <input
                          name="title"
                          className={tiInputClassName}
                          defaultValue={getRequestTitle(activeRequest)}
                        />
                      </label>
                      <TiNativeSelect
                        name="category_id"
                        label="Categoria"
                        defaultValue={String(activeRequest.category_id ?? "")}
                        options={createCategoryOptions}
                      />
                      <TiNativeSelect
                        name="priority"
                        label="Prioridade"
                        defaultValue={String(activeRequest.priority ?? "medium")}
                        options={REQUEST_PRIORITY_OPTIONS}
                      />
                      <label className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                        <span className={tiLabelClassName}>Descrição</span>
                        <textarea
                          name="description"
                          className={cn(tiInputClassName, "h-auto min-h-24 py-2")}
                          defaultValue={
                            activeRequest.description ??
                            getStringField(activeRequest, ["body", "details"], "")
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className={tiSecondaryButtonClassName}
                      disabled={updateRequestMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{updateRequestMutation.isPending ? "Salvando..." : "Salvar edição"}</span>
                    </button>
                  </form>

                  <div className="space-y-2">
                    <span className={tiLabelClassName}>Atualizar status</span>
                    <div className="flex flex-wrap gap-2">
                      {REQUEST_STATUS_ACTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          disabled={isSaving || activeRequest.status === option.value}
                          onClick={() => handleUpdateStatus(option.value)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form className="space-y-2" onSubmit={handleAssignRequest}>
                    <label className="flex min-w-0 flex-col gap-2">
                      <span className={tiLabelClassName}>Atribuir responsável</span>
                      <input
                        className={tiInputClassName}
                        value={assignedUserId}
                        placeholder="ID do usuário"
                        onChange={(event) => setAssignedUserId(event.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className={tiSecondaryButtonClassName}
                      disabled={assignRequestMutation.isPending}
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>{assignRequestMutation.isPending ? "Atribuindo..." : "Atribuir"}</span>
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeRequestId ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">Mensagens</h3>
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-300" />
              </div>

              {isMessagesLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Carregando mensagens...</p>
              ) : null}

              {messagesQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-300">
                  Não foi possível carregar as mensagens.
                </p>
              ) : null}

              {!isMessagesLoading && !messagesQuery.isError && (messagesQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Ainda não há mensagens neste chamado.
                </p>
              ) : null}

              <div className="space-y-3">
                {(messagesQuery.data ?? []).map((message) => (
                  <div
                    key={message.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{message.author_name ?? getStringField(message, ["author"], "Autor")}</span>
                      <span>{formatDate(message.created_at)}</span>
                    </div>
                    <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {message.message ?? getStringField(message, ["content", "body"], "")}
                    </p>
                  </div>
                ))}
              </div>

              <form className="mt-4 space-y-3" onSubmit={handleCreateMessage}>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className={tiLabelClassName}>Nova mensagem</span>
                  <textarea
                    className={cn(tiInputClassName, "h-auto min-h-24 py-2")}
                    value={messageDraft}
                    placeholder="Escreva uma atualização para o chamado."
                    onChange={(event) => setMessageDraft(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className={tiPrimaryButtonClassName}
                  disabled={createMessageMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                  <span>{createMessageMutation.isPending ? "Enviando..." : "Enviar mensagem"}</span>
                </button>
              </form>
            </div>
          ) : null}
        </aside>
      </div>
    </TiPanel>
  );
}
