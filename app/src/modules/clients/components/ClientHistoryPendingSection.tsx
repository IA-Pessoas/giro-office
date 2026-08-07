import { useMemo, useState, type ChangeEvent } from "react";
import { Plus, Trash2, NotebookPen } from "lucide-react";
import { toast } from "react-toastify";

import { useAuth } from "@/context/AuthContext";
import { isAdminPermission } from "@modules/auth";

import { useHistoryPendingList, useCreateHistoryPendingMutation, useDeleteHistoryPendingMutation } from "../hooks/useClientHistoryPending";
import type { ClientHistoryPendingItem } from "../types";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

export function ClientHistoryPendingSection({
  clientId,
  onCreateHistoryFromPending,
  activePendingId,
}: {
  clientId: string;
  onCreateHistoryFromPending: (pending: ClientHistoryPendingItem) => void;
  activePendingId?: string;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const isAdmin = isAdminPermission(user?.permission);

  const listQuery = useHistoryPendingList(userId);
  const createMutation = useCreateHistoryPendingMutation(clientId);
  const deleteMutation = useDeleteHistoryPendingMutation();

  const [reason, setReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scopedList = useMemo(() => {
    const list = listQuery.data ?? [];
    return list.filter((item) => item.client_id === clientId);
  }, [clientId, listQuery.data]);

  const handleCreatePending = async () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo da pendência.");
      return;
    }

    try {
      await createMutation.mutateAsync({ reason: reason.trim() });
      setReason("");
      toast.success("Pendência criada com sucesso.");
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível criar a pendência.";
      toast.error(message);
    }
  };

  const handleDelete = async (pendingId: string) => {
    if (!user) {
      return;
    }

    if (!isAdmin) {
      toast.warning("Você não tem permissão para remover esta pendência.");
      return;
    }

    try {
      setDeletingId(pendingId);
      await deleteMutation.mutateAsync({ pendingId, userId: user.id });
      toast.success("Pendência removida com sucesso.");
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Não foi possível remover a pendência.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={`${PANEL_CLASSNAME} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pendências</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Crie pendências e registre a conclusão criando um histórico.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Motivo</span>
          <textarea
            value={reason}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)}
            rows={3}
            className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[var(--colors-blue-500)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleCreatePending()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Criando..." : "Criar pendência"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {listQuery.isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando pendências...</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">
            Não foi possível carregar as pendências.
          </p>
        ) : scopedList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Nenhuma pendência ainda</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Crie uma pendência para acompanhar algo que precisa ser resolvido para este cliente.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {scopedList.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Pendência</p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{item.reason}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onCreateHistoryFromPending(item)}
                      disabled={activePendingId === item.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <NotebookPen className="h-4 w-4" />
                      {activePendingId === item.id ? "Criando..." : "Criar histórico"}
                    </button>

                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        disabled={deleteMutation.isPending && deletingId === item.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleteMutation.isPending && deletingId === item.id ? "Removendo..." : "Remover"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
