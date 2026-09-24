import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "react-toastify";

import { Dialog } from "@shared/components";
import { useQueryClient } from "@tanstack/react-query";

import { useCreateClientHistoryMutation, useUpdateClientHistoryMutation } from "../hooks/useClientHistories";
import { historyPendingQueryKey } from "../hooks/useClientHistoryPending";
import type { ClientHistoryItem } from "../types";

type Mode = "create" | "edit";

interface ClientHistoryModalProps {
  clientId: string;
  mode: Mode;
  isOpen: boolean;
  onClose: () => void;
  history?: ClientHistoryItem | null;
  pendingId?: string;
  pendingUserId?: string;
}

interface HistoryFormState {
  date: string;
  history: string;
  file: File | null;
}

function toDatetimeLocalValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function ClientHistoryModal({
  clientId,
  mode,
  isOpen,
  onClose,
  history,
  pendingId,
  pendingUserId,
}: ClientHistoryModalProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateClientHistoryMutation(clientId);
  const updateMutation = useUpdateClientHistoryMutation(clientId, history?.id ?? "missing");

  const initialState = useMemo<HistoryFormState>(() => {
    if (mode === "edit" && history) {
      return {
        date: toDatetimeLocalValue(history.date),
        history: history.history ?? "",
        file: null,
      };
    }

    return {
      date: "",
      history: "",
      file: null,
    };
  }, [history, mode]);

  const [form, setForm] = useState<HistoryFormState>(initialState);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setForm(initialState);
  }, [initialState, isOpen]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setForm((current) => ({ ...current, file }));
  };

  const handleSubmit = async () => {
    if (!form.date.trim() || !form.history.trim()) {
      toast.error("Preencha data e descrição para continuar.");
      return;
    }

    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          date: form.date,
          history: form.history.trim(),
          file: form.file,
          pending_id: pendingId,
        });
        if (pendingId) {
          await queryClient.invalidateQueries({ queryKey: ["clients", clientId, "histories"] });
          await queryClient.invalidateQueries({ queryKey: historyPendingQueryKey(pendingUserId) });
        }
        toast.success("Histórico criado com sucesso.");
        onClose();
        return;
      }

      if (!history?.id) {
        toast.error("Histórico inválido para edição.");
        return;
      }

      await updateMutation.mutateAsync({
        date: form.date,
        history: form.history.trim(),
      });
      toast.success("Histórico atualizado com sucesso.");
      onClose();
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : mode === "create"
            ? "Não foi possível criar o histórico."
            : "Não foi possível atualizar o histórico.";

      toast.error(message);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={mode === "create" ? "Criar histórico" : "Editar histórico"}
      description="Registre e acompanhe interações relacionadas ao cliente."
      contentClassName="w-[min(92vw,760px)]"
      bodyClassName="pb-4"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isPending}
            className="rounded-xl bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Data</span>
          <input
            name="date"
            type="datetime-local"
            value={form.date}
            onChange={handleChange}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[var(--colors-blue-500)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Histórico</span>
          <textarea
            name="history"
            value={form.history}
            onChange={handleChange}
            rows={5}
            className="resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[var(--colors-blue-500)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        {mode === "create" ? (
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Arquivo (opcional)</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-100 dark:hover:file:bg-slate-700"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Até 10 MB: PDF, imagem, texto, Word ou Excel. Atualização de arquivo não é suportada na edição.
            </p>
          </label>
        ) : null}
      </div>
    </Dialog>
  );
}

