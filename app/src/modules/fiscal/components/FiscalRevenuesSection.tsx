import { ClientPickerModal, type ClientPickerOption } from "@modules/clients";
import { PaginationControls } from "@shared/components";
import { useFetch } from "@shared/hooks";
import { toast } from "@shared/services/toast";
import { formatBrlInput } from "@shared/utils/inputFormatting";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  fiscalRevenueService,
  REVENUE_PAGE_SIZE,
  type FiscalMonthlyRevenue,
} from "../services/fiscalRevenueService";
import {
  formatCompetenceLabel,
  formatRevenueAmount,
  getFiscalErrorMessage,
  toRevenueAmount,
} from "../utils";
import { FISCAL_FIELD_CONTROL_CLASSNAME } from "./fiscalFieldStyles";

const INVALID_AMOUNT_MESSAGE = "Informe a receita em reais, sem valor negativo. Para receita zero, digite 0.";

function previousCompetence(): string {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

export function FiscalRevenuesSection({ canEdit }: { canEdit: boolean }) {
  const [client, setClient] = useState<ClientPickerOption | null>(null);
  const [competence, setCompetence] = useState(previousCompetence);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<FiscalMonthlyRevenue | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const list = useFetch(
    ["fiscal", "revenues", client?.id ?? "", page],
    () => fiscalRevenueService.list(client?.id ?? "", page),
    { enabled: Boolean(client) },
  );
  const save = useMutation({
    mutationFn: (value: string) =>
      editing
        ? fiscalRevenueService.update(editing.id, value)
        : fiscalRevenueService.create({ client_id: client?.id ?? "", competence, amount: value }),
    onSuccess: async () => {
      toast.success(editing ? "Receita corrigida." : "Receita registrada.");
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["fiscal", "revenues", client?.id ?? ""] });
    },
  });

  function resetForm() {
    if (editing) setCompetence(previousCompetence());
    setEditing(null);
    setAmount("");
    setAmountError(null);
  }

  function startEditing(item: FiscalMonthlyRevenue) {
    setEditing(item);
    setCompetence(item.competence);
    setAmount(formatRevenueAmount(item.amount));
    setAmountError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !canEdit) return;
    const value = toRevenueAmount(amount);
    if (value === null) {
      setAmountError(INVALID_AMOUNT_MESSAGE);
      return;
    }
    setAmountError(null);
    try {
      await save.mutateAsync(value);
    } catch (error) {
      toast.error(getFiscalErrorMessage(error));
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Receitas mensais</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Receita bruta do cliente por competência, base do cálculo do Simples Nacional. Competência sem receita registrada entra como zero no cálculo.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</p>
        <ClientPickerModal
          filters={{}}
          selectedClient={client}
          onSelectClient={(selection) => {
            setClient(selection);
            setPage(1);
            resetForm();
          }}
          triggerLabel="Selecionar cliente"
        />
      </div>

      {client && canEdit ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-gray-200 p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-start dark:border-slate-700">
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Competência
            <input type="month" required disabled={Boolean(editing)} value={competence} onChange={(event) => setCompetence(event.target.value)} className={`${FISCAL_FIELD_CONTROL_CLASSNAME} disabled:opacity-60`} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Receita bruta
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(formatBrlInput(event.target.value))}
              placeholder="R$ 0,00"
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "fiscal-revenue-amount-error" : undefined}
              className={FISCAL_FIELD_CONTROL_CLASSNAME}
            />
            {amountError ? <span id="fiscal-revenue-amount-error" role="alert" className="text-xs font-normal text-red-600">{amountError}</span> : null}
          </label>
          <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:mt-6">
            {save.isPending ? "Salvando..." : editing ? "Salvar correção" : "Registrar receita"}
          </button>
          {editing ? (
            <button type="button" onClick={resetForm} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 md:mt-6 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">
              Cancelar
            </button>
          ) : null}
        </form>
      ) : null}

      {client ? (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Receitas registradas</h3>
          {list.isLoading ? <p role="status" className="text-sm text-gray-600">Carregando receitas...</p> : null}
          {list.error ? <p role="alert" className="text-sm text-red-600">{getFiscalErrorMessage(list.error)}</p> : null}
          {list.data?.data.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma receita registrada para este cliente.</p> : null}
          {list.data?.data.length ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800 dark:text-gray-300"><tr><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Receita bruta</th><th className="px-4 py-3">Atualizada em</th>{canEdit ? <th className="px-4 py-3">Ações</th> : null}</tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {list.data.data.map((item) => (
                    <tr key={item.id} className="text-gray-800 dark:text-gray-200">
                      <td className="px-4 py-3">{formatCompetenceLabel(item.competence)}</td>
                      <td className="px-4 py-3">{formatRevenueAmount(item.amount)}</td>
                      <td className="px-4 py-3">{new Date(item.updatedAt).toLocaleDateString("pt-BR")}</td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => startEditing(item)} aria-label={`Corrigir receita de ${formatCompetenceLabel(item.competence)}`} className="text-blue-700 hover:underline dark:text-blue-300">
                            Corrigir
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} limit={REVENUE_PAGE_SIZE} total={list.data.total} count={list.data.data.length} hasMore={list.data.hasMore} isFetching={list.isFetching} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => value + 1)} />
            </div>
          ) : null}
        </div>
      ) : <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um cliente para consultar ou registrar receitas.</p>}
    </section>
  );
}
