import { useState } from "react";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import { useRhCategories, useRhRequests } from "../hooks/useRhRequests";
import type { RhRequestStatus, RhRequestRow } from "../types";
import {
  formatRhDateTime,
  getRhRequestStatusClassName,
  getRhRequestStatusLabel,
  getRhRequestUrgencyClassName,
  getRhRequestUrgencyLabel,
} from "../utils/rhRequestUi";
import { RhRequestsFilters } from "./RhRequestsFilters";
import { RhRequestsTable } from "./RhRequestsTable";

const MISSING_CATEGORY_LABEL = "Categoria não encontrada";
const MISSING_ASSIGNEE_LABEL = "Não atribuído";

export function RhRequestsSection() {
  const [statusFilter, setStatusFilter] = useState<RhRequestStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  const categoriesQuery = useRhCategories();
  const assignableUsersQuery = useAssignableUsers();
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

  return (
    <div className="space-y-6">
      <RhRequestsFilters
        categories={categories}
        selectedStatus={statusFilter}
        selectedCategoryId={categoryFilter}
        onStatusChange={setStatusFilter}
        onCategoryChange={setCategoryFilter}
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
        <RhRequestsTable rows={rows} />
      ) : null}
    </div>
  );
}
