import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Plus,
  Send,
  Tags,
  Ticket,
  UserCheck,
} from "lucide-react";

import { Dialog } from "@shared/components";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge, type StatusBadgeConfig } from "@shared/components/StatusBadge";
import { cn } from "@shared/ui/newLayout/utils";

import {
  useCreateTiRequest,
  useCreateTiRequestCategory,
  useCreateTiRequestMessage,
  useAssignTiRequest,
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
  tiDialogSectionClassName,
  tiDialogSubsectionClassName,
  tiLabelClassName,
  tiPrimaryButtonClassName,
  tiSecondaryButtonClassName,
} from "./tiWorkspaceUi";

const REQUEST_STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "New", label: "Novo" },
  { value: "In_Progress", label: "Em atendimento" },
  { value: "Waiting", label: "Aguardando" },
  { value: "Resolved", label: "Resolvido" },
  { value: "Closed", label: "Fechado" },
] as const;

const REQUEST_URGENCY_OPTIONS = [
  { value: "Low", label: "Baixa" },
  { value: "Medium", label: "Média" },
  { value: "High", label: "Alta" },
  { value: "Critical", label: "Crítica" },
] as const;

const REQUEST_STATUS_UPDATE_OPTIONS = REQUEST_STATUS_OPTIONS.filter((option) => option.value);

type RequestDraft = {
  title: string;
  description: string;
  category_id: string;
  urgency: string;
};

type CategoryDraft = {
  name: string;
};

const INITIAL_REQUEST_DRAFT: RequestDraft = {
  title: "",
  description: "",
  category_id: "",
  urgency: "Medium",
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

function getRelatedUserName(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of ["full_name", "name", "login", "email"]) {
    const field = record[key];

    if (typeof field === "string" && field.trim()) {
      return field;
    }
  }

  return undefined;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
    case "New":
      return { label: "Novo", variant: "info" };
    case "In_Progress":
      return { label: "Em atendimento", variant: "warning" };
    case "Waiting":
      return { label: "Aguardando", variant: "warning" };
    case "Resolved":
      return { label: "Resolvido", variant: "success" };
    case "Closed":
      return { label: "Fechado", variant: "neutral" };
    default:
      return { label: normalizedStatus || "Sem status", variant: "neutral" };
  }
}

function getUrgencyLabel(urgency: unknown): string {
  const option = REQUEST_URGENCY_OPTIONS.find((item) => item.value === urgency);

  if (option) {
    return option.label;
  }

  return typeof urgency === "string" && urgency ? urgency : "-";
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

function getRequesterLabel(
  request: TiRequest,
  currentUser?: { id?: string; name?: string } | null,
): string {
  if (request.requester_name) {
    return request.requester_name;
  }

  const requesterName = getRelatedUserName(request.requester);

  if (requesterName) {
    return requesterName;
  }

  if (
    currentUser?.id &&
    request.requester_id !== undefined &&
    request.requester_id !== null &&
    String(request.requester_id) === currentUser.id
  ) {
    return currentUser.name || "Você";
  }

  return getStringField(request, ["created_by"], "Sem solicitante");
}

function getAssigneeLabel(request: TiRequest): string {
  if (request.assigned_to_name) {
    return request.assigned_to_name;
  }

  const assigneeName = getRelatedUserName(request.assigned_to);

  if (assigneeName) {
    return assigneeName;
  }

  if (request.assigned_to_id !== undefined && request.assigned_to_id !== null) {
    return "Responsável atribuído";
  }

  return "Sem responsável";
}

function hasAssignee(request: TiRequest): boolean {
  return (
    Boolean(request.assigned_to_name) ||
    Boolean(getRelatedUserName(request.assigned_to)) ||
    (request.assigned_to_id !== undefined && request.assigned_to_id !== null)
  );
}

export function TiRequestsTab() {
  const { user: currentUser } = useAuth();
  const [filters, setFilters] = useState<TiListFilters>({ status: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<TiId | undefined>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState<RequestDraft>(INITIAL_REQUEST_DRAFT);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(INITIAL_CATEGORY_DRAFT);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const requestFilters = useMemo(() => filters, [filters]);
  const requestsQuery = useTiRequests(requestFilters);
  const categoriesQuery = useTiRequestCategories();
  const requests = requestsQuery.data ?? [];
  const selectedRequest = requests.find((request) => request.id === selectedRequestId);
  const activeRequestId = selectedRequestId;
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

  const filteredRequests = useMemo(() => {
    const normalizedSearchTerm = normalizeSearchText(searchTerm);

    if (!normalizedSearchTerm) {
      return requests;
    }

    return requests.filter((request) => {
      const searchableText = [
        getRequestTitle(request),
        request.description,
        getCategoryLabel(request, categoriesById),
        getRequesterLabel(request, currentUser),
      ]
        .map(normalizeSearchText)
        .join(" ");

      return searchableText.includes(normalizedSearchTerm);
    });
  }, [categoriesById, currentUser, requests, searchTerm]);

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

    if (!requestDraft.category_id) {
      setCreateFormError("Selecione uma categoria para criar o chamado.");
      return;
    }

    if (!requestDraft.description.trim()) {
      setCreateFormError("Informe uma descrição para criar o chamado.");
      return;
    }

    try {
      const createdRequest = await createRequestMutation.mutateAsync({
        title: requestDraft.title.trim(),
        description: requestDraft.description.trim(),
        category_id: requestDraft.category_id,
        urgency: requestDraft.urgency,
      });

      setSelectedRequestId(createdRequest.id);
      setIsDetailDialogOpen(true);
      handleCloseCreateDialog();
    } catch (error) {
      setCreateFormError(getErrorMessage(error));
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
    const description = formData.get("description")?.toString().trim() ?? "";
    const categoryId = formData.get("category_id")?.toString() ?? "";
    const urgency = formData.get("urgency")?.toString() ?? "";

    if (!title) {
      setActionError("Informe um título para salvar o chamado.");
      return;
    }

    try {
      await updateRequestMutation.mutateAsync({
        id: activeRequestId,
        payload: {
          title,
          ...(description ? { description } : {}),
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(urgency ? { urgency } : {}),
        },
      });
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleUpdateStatus(status: string) {
    setActionError(null);

    if (!activeRequestId || !status || activeRequest?.status === status) {
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

  async function handleAssignToMe() {
    setActionError(null);

    if (!activeRequestId) {
      return;
    }

    if (!currentUser?.id) {
      setActionError("Não foi possível identificar o usuário atual.");
      return;
    }

    try {
      await assignRequestMutation.mutateAsync({
        id: activeRequestId,
        payload: { assigned_to_id: currentUser.id },
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40 md:col-span-2">
              <span className={tiLabelClassName}>Solicitante</span>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {currentUser?.name ?? "Usuário atual"}
              </p>
            </div>
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
              label="Urgência"
              value={requestDraft.urgency}
              options={REQUEST_URGENCY_OPTIONS}
              onChange={(event) =>
                setRequestDraft((currentDraft) => ({
                  ...currentDraft,
                  urgency: event.target.value,
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
                value={searchTerm}
                placeholder="Título, solicitante ou descrição"
                onChange={(event) => setSearchTerm(event.target.value)}
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

      <div className="space-y-4">
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

          {!isRequestsLoading && !requestsQuery.isError && filteredRequests.length === 0 ? (
            <TiEmptyState
              icon={Ticket}
              title="Nenhum chamado encontrado"
              description="A fila de atendimento aparece aqui assim que houver chamados registrados."
            />
          ) : null}

          {!isRequestsLoading && !requestsQuery.isError && filteredRequests.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Chamado</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Urgência</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Criado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {filteredRequests.map((request) => {
                      const isSelected = request.id === activeRequestId;

                      return (
                        <tr
                          key={request.id}
                          className={cn(
                            "cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70",
                            isSelected ? "bg-blue-50 dark:bg-blue-950/30" : null,
                          )}
                          onClick={() => {
                            setSelectedRequestId(request.id);
                            setActionError(null);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <td className="min-w-64 px-4 py-3">
                            <span className="block font-medium text-slate-950 dark:text-white">
                              {getRequestTitle(request)}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {getRequesterLabel(request, currentUser)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {getCategoryLabel(request, categoriesById)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {getUrgencyLabel(request.urgency)}
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

        <Dialog
          open={isDetailDialogOpen}
          onOpenChange={(nextOpen) => {
            setIsDetailDialogOpen(nextOpen);
            if (!nextOpen) {
              setActionError(null);
            }
          }}
          title={activeRequest ? getRequestTitle(activeRequest) : "Detalhe do chamado"}
          description="Detalhe, conversas e ações do atendimento."
          contentClassName="w-[min(94vw,920px)] overflow-hidden border-slate-300 shadow-2xl dark:border-slate-700"
          bodyClassName="max-h-[72vh] overflow-y-auto bg-slate-100/70 dark:bg-slate-950/50"
        >
          <div className="space-y-4">
          {actionError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
              {actionError}
            </div>
          ) : null}

          {activeRequestId ? (
            <div className={tiDialogSectionClassName}>
              {isDetailLoading ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">Carregando detalhe...</p>
              ) : null}

              {requestDetailQuery.isError ? (
                <p className="text-sm text-red-600 dark:text-red-300">
                  Não foi possível carregar o detalhe do chamado.
                </p>
              ) : null}

              {activeRequest ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start justify-end gap-3 sm:order-2">
                      <StatusBadge config={getStatusBadgeConfig(activeRequest.status)} size="sm" />
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300 sm:order-1">
                      {activeRequest.description ??
                        getStringField(activeRequest, ["body", "details"], "Sem descrição.")}
                    </p>
                  </div>

                  <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
                      <dt className={tiLabelClassName}>Categoria</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {getCategoryLabel(activeRequest, categoriesById)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
                      <dt className={tiLabelClassName}>Solicitante</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {getRequesterLabel(activeRequest, currentUser)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
                      <dt className={tiLabelClassName}>Responsável</dt>
                      <dd className="mt-1 flex flex-col items-start gap-2 text-slate-700 dark:text-slate-200">
                        <span>{getAssigneeLabel(activeRequest)}</span>
                        {!hasAssignee(activeRequest) ? (
                          <button
                            type="button"
                            className={cn(
                              tiSecondaryButtonClassName,
                              "h-8 min-w-[104px] justify-center px-3 text-xs whitespace-nowrap",
                            )}
                            disabled={assignRequestMutation.isPending || !currentUser?.id}
                            onClick={handleAssignToMe}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>
                              {assignRequestMutation.isPending ? "Assumindo..." : "Assumir"}
                            </span>
                          </button>
                        ) : null}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
                      <dt className={tiLabelClassName}>Urgência</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {getUrgencyLabel(activeRequest.urgency)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
                      <dt className={tiLabelClassName}>Atualizado em</dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-200">
                        {formatDate(activeRequest.updated_at)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    key={`edit-${activeRequest.id}`}
                    className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800"
                    onSubmit={handleUpdateRequest}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className={tiLabelClassName}>Editar chamado</span>
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
                        className="lg:w-44"
                      />
                      <TiNativeSelect
                        name="urgency"
                        label="Urgência"
                        defaultValue={String(activeRequest.urgency ?? "Medium")}
                        options={REQUEST_URGENCY_OPTIONS}
                        className="lg:w-36"
                      />
                      <TiNativeSelect
                        label="Status do chamado"
                        value={String(activeRequest.status ?? "")}
                        options={REQUEST_STATUS_UPDATE_OPTIONS}
                        disabled={isSaving}
                        className="lg:w-44"
                        onChange={(event) => handleUpdateStatus(event.target.value)}
                      />
                    </div>
                    <label className="flex min-w-0 flex-col gap-2">
                      <span className={tiLabelClassName}>Descrição</span>
                      <textarea
                        name="description"
                        className={cn(tiInputClassName, "h-auto min-h-16 py-2")}
                        defaultValue={
                          activeRequest.description ??
                          getStringField(activeRequest, ["body", "details"], "")
                        }
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className={tiSecondaryButtonClassName}
                        disabled={updateRequestMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{updateRequestMutation.isPending ? "Salvando..." : "Salvar"}</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeRequestId ? (
            <div className={tiDialogSectionClassName}>
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
                    className={tiDialogSubsectionClassName}
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
                    className={cn(tiInputClassName, "h-auto min-h-20 py-2")}
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
          </div>
        </Dialog>
      </div>
    </TiPanel>
  );
}
