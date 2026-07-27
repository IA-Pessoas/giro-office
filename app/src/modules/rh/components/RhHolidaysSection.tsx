import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "react-toastify";

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
  }

  async function handleConfirmDelete() {
    if (!holidayPendingDelete) {
      return;
    }

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
      toast.error(message);
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

      <DialogPrimitive.Root
        open={Boolean(holidayPendingDelete)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleCloseDeleteDialog();
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[1600] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[1700] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-lg focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <DialogPrimitive.Title className="sr-only">
              Excluir feriado
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Confirmação de exclusão de feriado
            </DialogPrimitive.Description>

            <div className="flex flex-col gap-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Excluir feriado
                  </h3>
                  <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Deseja realmente excluir este feriado? Essa ação não poderá ser
                    desfeita.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseDeleteDialog}
                  disabled={deleteHolidayMutation.isPending}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleteHolidayMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleteHolidayMutation.isPending ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
