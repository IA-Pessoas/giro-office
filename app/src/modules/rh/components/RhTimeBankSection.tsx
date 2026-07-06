import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";

import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useApproveRhTimeBankReleaseMutation,
  useRhTimeBankReleases,
  useRhTimeBankSummary,
} from "../hooks/useRhCalendar";
import { useRhPermissions } from "../hooks/useRhPermissions";
import type { RhTimeBankRelease, RhTimeBankReleaseListFilters } from "../types";
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

  const approveMutation = useApproveRhTimeBankReleaseMutation();
  const shouldShowSummary = !canManageTimeBank || Boolean(selectedUserId);

  const assignableUsersQuery = useAssignableUsers({
    enabled: canManageTimeBank,
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
  }

  async function handleConfirmApproval() {
    if (!releasePendingApproval) {
      return;
    }

    try {
      await approveMutation.mutateAsync({ id: releasePendingApproval.id });
      toast.success("Lançamento aprovado com sucesso.");
      setReleasePendingApproval(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível aprovar o lançamento.";
      toast.error(message);
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

      <DialogPrimitive.Root
        open={Boolean(releasePendingApproval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseApprovalDialog();
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[1800] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[1900] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <DialogPrimitive.Title className="sr-only">Aprovar lançamento</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Confirmação de aprovação de lançamento de banco de horas
            </DialogPrimitive.Description>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Aprovar lançamento
                  </h3>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Deseja aprovar este lançamento de banco de horas? Essa ação atualiza o status
                    do registro.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseApprovalDialog}
                  disabled={approveMutation.isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApproval}
                  disabled={approveMutation.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {approveMutation.isPending ? "Aprovando..." : "Aprovar"}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
