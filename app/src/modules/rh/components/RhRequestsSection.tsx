import { useEffect, useState } from "react";
import { ConfirmationDialog, PaginationControls } from "@shared/components";
import { DEFAULT_PAGE_SIZE } from "@shared/pagination/pagination";
import { toast } from "@shared/services/toast";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { useRhPermissions } from "../hooks/useRhPermissions";
import {
  useDeleteRhRequestMutation,
  useRhCategories,
  useRhRequests,
} from "../hooks/useRhRequests";
import type { RhRequest, RhRequestRow, RhRequestStatus } from "../types";
import {
  formatRhCategoryLabel,
  getRhRequestStatusClassName,
  getRhRequestStatusLabel,
  getRhRequestUrgencyClassName,
  getRhRequestUrgencyLabel,
} from "../utils/rhRequestUi";
import { formatRhDateTime } from "../utils/rhDate";
import { RhRequestDetailModal } from "./RhRequestDetailModal";
import { RhCategoriesManager } from "./RhCategoriesManager";
import { RhRequestFormModal } from "./RhRequestFormModal";
import { RhRequestsFilters } from "./RhRequestsFilters";
import { RhRequestsTable } from "./RhRequestsTable";

const MISSING_CATEGORY_LABEL = "Categoria não encontrada";
const MISSING_ASSIGNEE_LABEL = "Aguardando atribuição";
const MISSING_REQUESTER_LABEL = "Solicitante não identificado";

export function RhRequestsSection({ initialRequestId }: { initialRequestId?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState<RhRequestStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<RhRequest | null>(null);
  const [requestIdPendingDelete, setRequestIdPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRequestId) {
      setSelectedRequestId(initialRequestId);
    }
  }, [initialRequestId]);

  const { user, canManageRhRequests, canUseRhWorkflowMessages } = useRhPermissions("requests");
  const categoriesQuery = useRhCategories({ activeOnly: true });
  const assignableUsersQuery = useAssignableUsers({ enabled: canManageRhRequests, module: "rh" });
  const deleteRequestMutation = useDeleteRhRequestMutation();
  const requestsQuery = useRhRequests({
    status: statusFilter === "all" ? undefined : statusFilter,
    category_id: categoryFilter || undefined,
    requester_user_id: canManageRhRequests ? requesterFilter || undefined : user?.id,
    page,
    limit: DEFAULT_PAGE_SIZE,
  });

  const categories = categoriesQuery.data ?? [];
  const assignableUsers = assignableUsersQuery.data ?? [];
  const requestsPage = requestsQuery.data ?? {
    items: [],
    total: 0,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    hasMore: false,
  };
  const requests = requestsPage.items;

  const categoryNameById = new Map(
    categories.map((category) => [category.id, formatRhCategoryLabel(category.name)]),
  );
  const userNameById = new Map(
    assignableUsers.map((assignableUser) => [assignableUser.id, assignableUser.name]),
  );

  const rows: RhRequestRow[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    description: request.description,
    requesterUserId: request.requester_user_id,
    requesterUserLabel:
      request.requester?.name ??
      userNameById.get(request.requester_user_id) ??
      (request.requester_user_id === user?.id ? user?.name ?? "Você" : MISSING_REQUESTER_LABEL),
    categoryId: request.category_id,
    categoryLabel: categoryNameById.get(request.category_id) ?? MISSING_CATEGORY_LABEL,
    assignedToUserId: request.assigned_to_user_id,
    assignedToUserLabel:
      request.assigned_to?.name ??
      userNameById.get(request.assigned_to_user_id) ?? MISSING_ASSIGNEE_LABEL,
    urgency: request.urgency,
    urgencyLabel: getRhRequestUrgencyLabel(request.urgency),
    urgencyClassName: getRhRequestUrgencyClassName(request.urgency),
    status: request.status,
    statusLabel: getRhRequestStatusLabel(request.status),
    statusClassName: getRhRequestStatusClassName(request.status),
    createdAt: request.created_at,
    createdAtLabel: formatRhDateTime(request.created_at),
    updatedAt: request.updated_at,
    updatedAtLabel: formatRhDateTime(request.updated_at),
  }));

  const isLoading = categoriesQuery.isLoading || requestsQuery.isLoading;
  const error = categoriesQuery.error || requestsQuery.error;
  const auxiliaryError = canManageRhRequests ? assignableUsersQuery.error : null;
  const deletingRequestId = deleteRequestMutation.variables?.id ?? null;
  const requestPendingDeleteTitle = requests.find(
    (request) => request.id === requestIdPendingDelete,
  )?.title;
  const totalPages = Math.max(1, Math.ceil(requestsPage.total / requestsPage.pageSize));

  function getCategoryLabel(categoryId: string) {
    return categoryNameById.get(categoryId) ?? MISSING_CATEGORY_LABEL;
  }

  function getAssignedUserLabel(userId: string) {
    return (
      requests.find((request) => request.assigned_to_user_id === userId)?.assigned_to?.name ??
      userNameById.get(userId) ??
      MISSING_ASSIGNEE_LABEL
    );
  }

  function getRequesterLabel(request: RhRequest) {
    if (request.requester?.name) {
      return request.requester.name;
    }

    if (request.requester_user_id === user?.id) {
      return user?.name ?? "Você";
    }

    return userNameById.get(request.requester_user_id) ?? MISSING_REQUESTER_LABEL;
  }

  function handleStatusChange(nextStatus: RhRequestStatus | "all") {
    setStatusFilter(nextStatus);
    setPage(1);
  }

  function handleCategoryChange(nextCategory: string) {
    setCategoryFilter(nextCategory);
    setPage(1);
  }

  function handleRequesterChange(nextRequester: string) {
    setRequesterFilter(nextRequester);
    setPage(1);
  }

  function handleOpenCreate() {
    setEditingRequest(null);
    setIsFormOpen(true);
  }

  function handleOpenDetail(requestId: string) {
    setSelectedRequestId(requestId);
  }

  function handleCloseDetail() {
    setSelectedRequestId(null);
  }

  function handleOpenEdit(requestId: string) {
    if (!canManageRhRequests) {
      return;
    }

    const request = requests.find((candidate) => candidate.id === requestId) ?? null;
    setEditingRequest(request);
    setIsFormOpen(true);
  }

  function handleEditFromDetail(requestId: string) {
    handleCloseDetail();
    handleOpenEdit(requestId);
  }

  function handleRequestDelete(requestId: string) {
    if (!canManageRhRequests) {
      return;
    }

    setRequestIdPendingDelete(requestId);
  }

  function handleCloseDeleteDialog() {
    if (deleteRequestMutation.isPending) {
      return;
    }

    setRequestIdPendingDelete(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!requestIdPendingDelete) {
      return;
    }

    setDeleteError(null);
    try {
      await deleteRequestMutation.mutateAsync({ id: requestIdPendingDelete });
      if (selectedRequestId === requestIdPendingDelete) {
        handleCloseDetail();
      }
      if (editingRequest?.id === requestIdPendingDelete) {
        handleCloseForm();
      }
      setRequestIdPendingDelete(null);
      toast.success("Solicitação excluída com sucesso.");
    } catch (mutationError) {
      const errorMessage =
        mutationError instanceof Error
          ? mutationError.message
          : "Não foi possível excluir a solicitação.";
      toast.error(errorMessage);
      setDeleteError(errorMessage);
      // Relança para o diálogo permanecer aberto com o erro.
      throw mutationError;
    }
  }

  function handleCloseForm() {
    setIsFormOpen(false);
    setEditingRequest(null);
  }

  return (
    <div className="space-y-6">
      {canManageRhRequests ? <RhCategoriesManager /> : null}
      <RhRequestsFilters
        categories={categories}
        requesters={canManageRhRequests ? assignableUsers : undefined}
        selectedStatus={statusFilter}
        selectedCategoryId={categoryFilter}
        selectedRequesterId={requesterFilter}
        title={canManageRhRequests ? "Solicitações" : "Minhas solicitações"}
        description={
          canManageRhRequests
            ? "Acompanhe os chamados de RH por status e categoria."
            : "Acompanhe as solicitações abertas por você ou atribuídas a você."
        }
        onStatusChange={handleStatusChange}
        onCategoryChange={handleCategoryChange}
        onRequesterChange={handleRequesterChange}
        onOpenCreate={handleOpenCreate}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando solicitações...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar as solicitações de RH.
        </div>
      ) : null}

      {!isLoading && !error && auxiliaryError ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Não foi possível carregar os responsáveis agora.
        </div>
      ) : null}

      {!isLoading && !error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhuma solicitação encontrada para os filtros selecionados.
        </div>
      ) : null}

      {!isLoading && !error && rows.length > 0 ? (
        <>
          <RhRequestsTable
            rows={rows}
            canManageRequests={canManageRhRequests}
            showRequester={canManageRhRequests}
            onOpenDetail={handleOpenDetail}
            onEdit={handleOpenEdit}
            onDelete={handleRequestDelete}
            deletingRequestId={deletingRequestId}
          />
          <PaginationControls
            page={requestsPage.page}
            limit={requestsPage.pageSize}
            total={requestsPage.total}
            count={rows.length}
            hasMore={requestsPage.hasMore}
            isFetching={requestsQuery.isFetching}
            totalPages={totalPages}
            onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            onNext={() => setPage((currentPage) => currentPage + 1)}
            onPageChange={setPage}
          />
        </>
      ) : null}

      <RhRequestFormModal
        open={isFormOpen}
        categories={categories}
        assignableUsers={assignableUsers}
        canManageRequests={canManageRhRequests}
        assignableUsersUnavailableMessage={
          auxiliaryError ? "Não foi possível carregar os responsáveis agora." : null
        }
        request={editingRequest}
        onClose={handleCloseForm}
      />

      <RhRequestDetailModal
        open={Boolean(selectedRequestId)}
        requestId={selectedRequestId}
        getCategoryLabel={getCategoryLabel}
        getAssignedUserLabel={getAssignedUserLabel}
        getRequesterLabel={getRequesterLabel}
        currentUserId={user?.id}
        canManageRequest={canManageRhRequests}
        canUseRhWorkflowMessages={canUseRhWorkflowMessages}
        isDeleting={deleteRequestMutation.isPending}
        onClose={handleCloseDetail}
        onEdit={handleEditFromDetail}
        onDelete={handleRequestDelete}
      />

      <ConfirmationDialog
        open={Boolean(requestIdPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
        title="Excluir solicitação"
        description={`Excluir ${requestPendingDeleteTitle ? `a solicitação "${requestPendingDeleteTitle}"` : "esta solicitação de RH"}? Essa ação não poderá ser desfeita.`}
        onConfirm={handleConfirmDelete}
        isConfirming={deleteRequestMutation.isPending}
        errorMessage={deleteError}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />
    </div>
  );
}
