import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmationDialog } from "@shared/components";
import { toast } from "@shared/services/toast";

import {
  useDeleteRhHolidayMutation,
  useRhHolidays,
} from "../hooks/useRhCalendar";
import type { RhHoliday } from "../types";
import { RhHolidayFormPanel } from "./RhHolidayFormPanel";
import { RhHolidaysTable } from "./RhHolidaysTable";

export function RhHolidaysSection() {
  const [editingHoliday, setEditingHoliday] = useState<RhHoliday | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [holidayPendingDelete, setHolidayPendingDelete] = useState<RhHoliday | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const holidaysQuery = useRhHolidays();
  const deleteHolidayMutation = useDeleteRhHolidayMutation();
  const holidays = holidaysQuery.data ?? [];

  const sortedHolidays = useMemo(
    () => [...holidays].sort((left, right) => left.date.localeCompare(right.date)),
    [holidays],
  );

  function handleCloseDeleteDialog() {
    if (deleteHolidayMutation.isPending) {
      return;
    }

    setHolidayPendingDelete(null);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!holidayPendingDelete) {
      return;
    }

    setDeleteError(null);
    try {
      await deleteHolidayMutation.mutateAsync({ id: holidayPendingDelete.id });
      if (editingHoliday?.id === holidayPendingDelete.id) {
        setEditingHoliday(null);
        setIsFormOpen(false);
      }
      setHolidayPendingDelete(null);
      toast.success("Feriado excluído com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível excluir o feriado.";
      setDeleteError(message);
      // Relança para o diálogo permanecer aberto com o erro.
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Feriados
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Gerencie os feriados administrativos utilizados pelo RH.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingHoliday(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo feriado
          </button>
        </div>
      </div>

      {isFormOpen ? (
        <RhHolidayFormPanel
          holiday={editingHoliday}
          onClose={() => {
            setIsFormOpen(false);
            setEditingHoliday(null);
          }}
        />
      ) : null}

      {holidaysQuery.isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Carregando feriados...
        </div>
      ) : null}

      {!holidaysQuery.isLoading && holidaysQuery.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          Não foi possível carregar os feriados de RH.
        </div>
      ) : null}

      {!holidaysQuery.isLoading &&
      !holidaysQuery.error &&
      sortedHolidays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Nenhum feriado cadastrado até o momento.
        </div>
      ) : null}

      {!holidaysQuery.isLoading &&
      !holidaysQuery.error &&
      sortedHolidays.length > 0 ? (
        <RhHolidaysTable
          holidays={sortedHolidays}
          onEdit={(holiday) => {
            setEditingHoliday(holiday);
            setIsFormOpen(true);
          }}
          onDelete={setHolidayPendingDelete}
          deletingHolidayId={deleteHolidayMutation.variables?.id ?? null}
        />
      ) : null}

      <ConfirmationDialog
        open={Boolean(holidayPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
        title="Excluir feriado"
        description={`Excluir o feriado "${holidayPendingDelete?.name ?? ""}"? Essa ação não poderá ser desfeita.`}
        onConfirm={handleConfirmDelete}
        isConfirming={deleteHolidayMutation.isPending}
        errorMessage={deleteError}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />
    </div>
  );
}
