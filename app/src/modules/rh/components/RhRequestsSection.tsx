import { useState } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useDeleteRhRequestMutation,
  useRhCategories,
  useRhRequests,
} from "../hooks/useRhRequests";
import type { RhRequest, RhRequestRow, RhRequestStatus } from "../types";
import {
  formatRhDateTime,
  getRhRequestStatusClassName,
  getRhRequestStatusLabel,
  getRhRequestUrgencyClassName,
  getRhRequestUrgencyLabel,
} from "../utils/rhRequestUi";
import { RhRequestDetailModal } from "./RhRequestDetailModal";
import { RhRequestFormModal } from "./RhRequestFormModal";
import { RhRequestsFilters } from "./RhRequestsFilters";
import { RhRequestsTable } from "./RhRequestsTable";

const MISSING_CATEGORY_LABEL = "Categoria não encontrada";
const MISSING_ASSIGNEE_LABEL = "Não atribuído";

export function RhRequestsSection() {
  const [statusFilter, setStatusFilter] = useState<RhRequestStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<RhRequest | null>(null);
  const [requestIdPendingDelete, setRequestIdPendingDelete] = useState<string | null>(
    null,
  );

  const categoriesQuery = useRhCategories({ activeOnly: true });
  const assignableUsersQuery = useAssignableUsers();
  const deleteRequestMutation = useDeleteRhRequestMutation();
  const requestsQuery = useRhRequests({
    status: statusFilter === "all" ? undefined : statusFilter,
    category_id: categoryFilter || undefined,
  });

  const categories = categoriesQuery.data ?? [];
  const assignableUsers = assignableUsersQuery.data ?? [];
  const requests = requestsQuery.data ?? [];

  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const userNameById = new Map(assignableUsers.map((user) => [user.id, user.name]));

  const rows: RhRequestRow[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    description: request.description,
    categoryId: request.category_id,
    categoryLabel:
      categoryNameById.get(request.category_id) ?? MISSING_CATEGORY_LABEL,
    assignedToUserId: request.assigned_to_user_id,
    assignedToUserLabel:
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

  const isLoading =
    categoriesQuery.isLoading ||
    assignableUsersQuery.isLoading ||
    requestsQuery.isLoading;
  const error =
    categoriesQuery.error || assignableUsersQuery.error || requestsQuery.error;
  const deletingRequestId = deleteRequestMutation.variables?.id ?? null;

  function getCategoryLabel(categoryId: string) {
    return categoryNameById.get(categoryId) ?? MISSING_CATEGORY_LABEL;
  }

  function getAssignedUserLabel(userId: string) {
    return userNameById.get(userId) ?? MISSING_ASSIGNEE_LABEL;
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
    const request = requests.find((candidate) => candidate.id === requestId) ?? null;
    setEditingRequest(request);
    setIsFormOpen(true);
  }

  function handleEditFromDetail(requestId: string) {
    handleCloseDetail();
    handleOpenEdit(requestId);
  }

  function handleRequestDelete(requestId: string) {
    setRequestIdPendingDelete(requestId);
  }

  function handleCloseDeleteDialog() {
    if (deleteRequestMutation.isPending) {
      return;
    }

    setRequestIdPendingDelete(null);
  }

  async function handleConfirmDelete() {
    if (!requestIdPendingDelete) {
      return;
    }

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
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a solicitação.";
      toast.error(errorMessage);
    }
  }

  function handleCloseForm() {
    setIsFormOpen(false);
    setEditingRequest(null);
  }

  return (
    <div className="space-y-6">
      <RhRequestsFilters
        categories={categories}
        selectedStatus={statusFilter}
        selectedCategoryId={categoryFilter}
        onStatusChange={setStatusFilter}
        onCategoryChange={setCategoryFilter}
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

      {!isLoading && !error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhuma solicitação encontrada para os filtros selecionados.
        </div>
      ) : null}

      {!isLoading && !error && rows.length > 0 ? (
        <RhRequestsTable
          rows={rows}
          onOpenDetail={handleOpenDetail}
          onEdit={handleOpenEdit}
          onDelete={handleRequestDelete}
          deletingRequestId={deletingRequestId}
        />
      ) : null}

      <RhRequestFormModal
        open={isFormOpen}
        categories={categories}
        assignableUsers={assignableUsers}
        request={editingRequest}
        onClose={handleCloseForm}
      />

      <RhRequestDetailModal
        open={Boolean(selectedRequestId)}
        requestId={selectedRequestId}
        getCategoryLabel={getCategoryLabel}
        getAssignedUserLabel={getAssignedUserLabel}
        isDeleting={deleteRequestMutation.isPending}
        onClose={handleCloseDetail}
        onEdit={handleEditFromDetail}
        onDelete={handleRequestDelete}
      />

      <Dialog
        open={Boolean(requestIdPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
        title="Excluir solicitação"
        description="Confirmação de exclusão de solicitação de RH"
        contentClassName="w-[min(92vw,460px)]"
        footer={
          <>
            <button
              type="button"
              onClick={handleCloseDeleteDialog}
              disabled={deleteRequestMutation.isPending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteRequestMutation.isPending}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              {deleteRequestMutation.isPending ? "Excluindo..." : "Excluir"}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Deseja realmente excluir esta solicitação de RH?
        </p>
      </Dialog>
    </div>
  );
}
