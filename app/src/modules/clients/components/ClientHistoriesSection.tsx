import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

import { ConfirmationDialog } from "@shared/components";
import { useClientHistories, useDeleteClientHistoryMutation } from "../hooks/useClientHistories";
import type { ClientHistoryItem } from "../types";
import { canDeleteClientHistory } from "../utils/historyAccess";
import { ClientHistoryModal } from "./ClientHistoryModal";
import { ClientHistoryPendingSection } from "./ClientHistoryPendingSection";
import { useAuth } from "@/context/AuthContext";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR");
}

export function ClientHistoriesSection({ clientId }: { clientId: string }) {
  const historiesQuery = useClientHistories(clientId);
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientHistoryItem | null>(null);
  const [pendingToCreate, setPendingToCreate] = useState<{ id: string } | null>(null);
  const [deleting, setDeleting] = useState<ClientHistoryItem | null>(null);
  const deleteMutation = useDeleteClientHistoryMutation(clientId);

  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteMutation.mutateAsync(deleting.id);
    toast.success("Histórico excluído com sucesso.");
  };

  const ordered = useMemo(() => {
    const list = historiesQuery.data ?? [];
    return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historiesQuery.data]);

  return (
    <div className="space-y-6">
      <section className={`${PANEL_CLASSNAME} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Históricos</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Registre e acompanhe interações relacionadas ao cliente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]"
        >
          <Plus className="h-4 w-4" />
          Novo histórico
        </button>
      </div>

      <div className="mt-5">
        {historiesQuery.isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando históricos...</p>
        ) : historiesQuery.isError ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">
            Não foi possível carregar os históricos deste cliente.
          </p>
        ) : ordered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Nenhum histórico ainda</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Crie o primeiro histórico para começar a acompanhar este cliente.
            </p>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Criar primeiro histórico
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {ordered.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatDate(item.date)}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                      {item.history}
                    </p>
                    {item.user?.name ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">por {item.user.name}</p>
                    ) : null}
                    {item.file ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">Com anexo</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </button>
                    {canDeleteClientHistory(user, item) ? (
                      <button
                        type="button"
                        onClick={() => setDeleting(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir histórico"
        description="O histórico e o anexo, se houver, serão excluídos. Essa ação não pode ser desfeita."
        onConfirm={confirmDelete}
        isConfirming={deleteMutation.isPending}
        errorMessage={null}
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
      />

      <ClientHistoryModal
        clientId={clientId}
        mode="create"
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
      <ClientHistoryModal
        clientId={clientId}
        mode="edit"
        isOpen={Boolean(editing)}
        history={editing}
        onClose={() => setEditing(null)}
      />

      <ClientHistoryModal
        clientId={clientId}
        mode="create"
        isOpen={Boolean(pendingToCreate)}
        pendingId={pendingToCreate?.id}
        pendingUserId={user?.id}
        onClose={() => setPendingToCreate(null)}
      />
      </section>

      <ClientHistoryPendingSection
        clientId={clientId}
        onCreateHistoryFromPending={(pending) => setPendingToCreate({ id: pending.id })}
        activePendingId={pendingToCreate?.id ?? undefined}
      />
    </div>
  );
}

