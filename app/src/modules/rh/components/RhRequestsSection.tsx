import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
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
    categories.map((category) => [category.id, formatRhCategoryLabel(category.name)]),
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

      <DialogPrimitive.Root
        open={Boolean(requestIdPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[1500] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <DialogPrimitive.Title className="sr-only">
              Excluir solicitação
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Confirmação de exclusão de solicitação de RH
            </DialogPrimitive.Description>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Excluir solicitação
                  </h3>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Deseja realmente excluir esta solicitação de RH? Essa ação não
                    poderá ser desfeita.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
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
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteRequestMutation.isPending ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
