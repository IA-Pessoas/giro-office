import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";

import { useAuth } from "@/context/AuthContext";
import { permissionService } from "@modules/users/services/permissionService";
import { normalizePermissionResponse } from "@modules/users/utils/permissionUtils";
import { useFetch } from "@shared/hooks";
import { useAssignableUsers } from "../hooks/useAssignableUsers";
import {
  useApproveRhTimeBankReleaseMutation,
  useRhTimeBankReleases,
} from "../hooks/useRhCalendar";
import type { RhTimeBankRelease, RhTimeBankReleaseListFilters } from "../types";
import {
  RhTimeBankFilters,
  type RhTimeBankStatusFilter,
} from "./RhTimeBankFilters";
import { RhTimeBankFormPanel } from "./RhTimeBankFormPanel";
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
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStatus, setSelectedStatus] =
    useState<RhTimeBankStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState(getMonthStartInputValue);
  const [dateTo, setDateTo] = useState(getTodayInputValue);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [releasePendingApproval, setReleasePendingApproval] =
    useState<RhTimeBankRelease | null>(null);

  const assignableUsersQuery = useAssignableUsers();
  const approveMutation = useApproveRhTimeBankReleaseMutation();
  const permissionQuery = useFetch(
    ["rh", "time-bank", "permissions", user?.id ?? ""],
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

  const canManageTimeBank = Boolean(
    user?.permission === 2 ||
      (normalizedPermissions?.rh !== null &&
        normalizedPermissions?.rh !== undefined &&
        normalizedPermissions.rh >= 1),
  );

  const effectiveUserId = canManageTimeBank ? selectedUserId : user?.id ?? "";
  const filters: RhTimeBankReleaseListFilters = {
    user_id: effectiveUserId || undefined,
    is_approved:
      selectedStatus === "all"
        ? undefined
        : selectedStatus === "approved"
          ? true
          : false,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const releasesQuery = useRhTimeBankReleases(filters);
  const assignableUsers = assignableUsersQuery.data ?? [];
  const releases = releasesQuery.data ?? [];

  const userNameById = useMemo(() => {
    return new Map(assignableUsers.map((assignableUser) => [assignableUser.id, assignableUser.name]));
  }, [assignableUsers]);

  const currentUserName = user?.name?.trim() || "Voce";

  function getUserLabel(userId: string) {
    if (user?.id === userId) {
      return currentUserName;
    }

    return userNameById.get(userId) ?? "Colaborador nao encontrado";
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
      toast.success("Lancamento aprovado com sucesso.");
      setReleasePendingApproval(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel aprovar o lancamento.";
      toast.error(message);
    }
  }

  const isLoading =
    releasesQuery.isLoading ||
    (canManageTimeBank && assignableUsersQuery.isLoading && !assignableUsersQuery.data);
  const error =
    releasesQuery.error ||
    (canManageTimeBank ? assignableUsersQuery.error : null) ||
    permissionQuery.error;

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

      {isCreateOpen && canManageTimeBank ? (
        <RhTimeBankFormPanel
          assignableUsers={assignableUsers}
          defaultUserId={selectedUserId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando lancamentos de banco de horas...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Nao foi possivel carregar os lancamentos de banco de horas.
        </div>
      ) : null}

      {!isLoading && !error && releases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhum lancamento encontrado para os filtros selecionados.
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
            <DialogPrimitive.Title className="sr-only">
              Aprovar lancamento
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Confirmacao de aprovacao de lancamento de banco de horas
            </DialogPrimitive.Description>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Aprovar lancamento
                  </h3>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Deseja aprovar este lancamento de banco de horas? Essa acao atualiza o
                    status do registro.
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
