import { useMemo, useState } from "react";
import { ConfirmationDialog } from "@shared/components";
import { toast } from "@shared/services/toast";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useApproveRhTimeBankReleaseMutation,
  useRhTimeBankReleases,
  useRhTimeBankSummary,
} from "../hooks/useRhCalendar";
import { useRhPermissions } from "../hooks/useRhPermissions";
import type { RhTimeBankRelease, RhTimeBankReleaseListFilters } from "../types";
import { formatRhDate } from "../utils/rhDate";
import { RhTimeBankFilters, type RhTimeBankStatusFilter } from "./RhTimeBankFilters";
import { RhTimeBankFormPanel } from "./RhTimeBankFormPanel";
import { RhTimeBankSummaryCards } from "./RhTimeBankSummaryCards";
import { RhTimeBankTable } from "./RhTimeBankTable";

function formatInputDate(date: Date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function getMonthStartInputValue() {
  const now = new Date();
  return formatInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getTodayInputValue() {
  return formatInputDate(new Date());
}

export function RhTimeBankSection() {
  const { user, canManageRhTimeBank: canManageTimeBank } = useRhPermissions("time-bank");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<RhTimeBankStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [releasePendingApproval, setReleasePendingApproval] =
    useState<RhTimeBankRelease | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const approveMutation = useApproveRhTimeBankReleaseMutation();
  const shouldShowSummary = !canManageTimeBank || Boolean(selectedUserId);

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManageTimeBank,
    module: "rh",
  });

  const effectiveUserId = canManageTimeBank ? selectedUserId : user?.id ?? "";
  const filters: RhTimeBankReleaseListFilters = {
    user_id: effectiveUserId || undefined,
    is_approved:
      selectedStatus === "all" ? undefined : selectedStatus === "approved" ? true : false,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const releasesQuery = useRhTimeBankReleases(filters);
  const timeBankSummaryQuery = useRhTimeBankSummary(
    canManageTimeBank ? selectedUserId || undefined : undefined,
    shouldShowSummary,
  );
  const assignableUsers = assignableUsersQuery.data ?? [];
  const releases = releasesQuery.data ?? [];
  const auxiliaryError = canManageTimeBank ? assignableUsersQuery.error : null;

  const userNameById = useMemo(() => {
    return new Map(assignableUsers.map((assignableUser) => [assignableUser.id, assignableUser.name]));
  }, [assignableUsers]);

  const currentUserName = user?.name?.trim() || "Você";
  const selectedUserLabel = selectedUserId
    ? assignableUsers.find((assignableUser) => assignableUser.id === selectedUserId)?.name ?? null
    : null;

  function getUserLabel(userId: string) {
    if (user?.id === userId) {
      return currentUserName;
    }

    return userNameById.get(userId) ?? "Colaborador não encontrado";
  }

  function handleOpenCreate() {
    if (!canManageTimeBank) {
      return;
    }

    setIsCreateOpen(true);
  }

  function handleCloseApprovalDialog() {
    if (approveMutation.isPending) {
      return;
    }

    setReleasePendingApproval(null);
    setApprovalError(null);
  }

  async function handleConfirmApproval() {
    if (!releasePendingApproval) {
      return;
    }

    setApprovalError(null);
    try {
      await approveMutation.mutateAsync({ id: releasePendingApproval.id });
      toast.success("Lançamento aprovado com sucesso.");
      setReleasePendingApproval(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível aprovar o lançamento.";
      setApprovalError(message);
      // Relança para o diálogo permanecer aberto com o erro.
      throw error;
    }
  }

  const isLoading = releasesQuery.isLoading;
  const error = releasesQuery.error;

  return (
    <div className="space-y-6">
      <RhTimeBankFilters
        assignableUsers={assignableUsers}
        canManageTimeBank={canManageTimeBank}
        selectedUserId={selectedUserId}
        selectedStatus={selectedStatus}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onUserChange={setSelectedUserId}
        onStatusChange={setSelectedStatus}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onOpenCreate={handleOpenCreate}
      />

      {shouldShowSummary ? (
        <RhTimeBankSummaryCards
          currentUserLabel={currentUserName}
          selectedUserLabel={selectedUserLabel}
          summary={timeBankSummaryQuery.data ?? null}
          isLoading={timeBankSummaryQuery.isLoading}
          hasError={Boolean(timeBankSummaryQuery.error)}
        />
      ) : null}

      {canManageTimeBank ? (
        <RhTimeBankFormPanel
          open={isCreateOpen}
          assignableUsers={assignableUsers}
          defaultUserId={selectedUserId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}

      {!isLoading && !error && auxiliaryError ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
          Não foi possível carregar a lista de colaboradores agora.
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando lançamentos de banco de horas...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os lançamentos de banco de horas.
        </div>
      ) : null}

      {!isLoading && !error && releases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhum lançamento encontrado para os filtros selecionados.
        </div>
      ) : null}

      {!isLoading && !error && releases.length > 0 ? (
        <RhTimeBankTable
          releases={releases}
          getUserLabel={getUserLabel}
          canManageTimeBank={canManageTimeBank}
          approvingReleaseId={approveMutation.variables?.id ?? null}
          onApprove={setReleasePendingApproval}
        />
      ) : null}

      <ConfirmationDialog
        open={Boolean(releasePendingApproval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseApprovalDialog();
          }
        }}
        title="Aprovar lançamento"
        description={
          releasePendingApproval
            ? `Aprovar o lançamento de ${getUserLabel(releasePendingApproval.user_id)} em ${formatRhDate(releasePendingApproval.date)}? Essa ação atualiza o status do registro.`
            : ""
        }
        onConfirm={handleConfirmApproval}
        isConfirming={approveMutation.isPending}
        errorMessage={approvalError}
        confirmLabel="Aprovar"
        cancelLabel="Cancelar"
        variant="neutral"
      />
    </div>
  );
}
