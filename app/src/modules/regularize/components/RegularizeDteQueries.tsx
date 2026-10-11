import { formatDateToInput } from "@shared/utils/formatters";
import { useState } from "react";

import {
  useImportRegularizeDteQueryListsMutation,
  useRegularizeDteQueryGrid,
  useSetRegularizeDteQueryStatusMutation,
} from "../hooks/useRegularizeOperations";
import { REGULARIZE_DTE_QUERY_STATUSES, type RegularizeDteQueryStatus } from "../types";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import {
  regularizePanelAlertClassName as alertClassName,
  regularizePanelClassName,
  regularizePanelLabelClassName,
  regularizePanelSuccessClassName,
  regularizePanelTableCellClassName as cellClassName,
  regularizePrimaryButtonClassName,
  regularizeTextareaClassName,
  regularizeTextFieldClassName,
} from "./regularizeFormControls";

const STATUS_LABELS: Record<RegularizeDteQueryStatus, string> = {
  feita: "Feita",
  nao_feita: "Não feita",
  sem_registro: "Sem registro",
};


// Consultas diárias ao DTE (#1746): quem teve a consulta feita ou não em cada dia. É o
// "Status de consultas" do sistema anterior; não tem relação com a leitura dos avisos.
export function RegularizeDteQueries({ canEdit }: { canEdit: boolean }) {
  const [date, setDate] = useState(() => formatDateToInput(new Date()));
  const [done, setDone] = useState("");
  const [notDone, setNotDone] = useState("");
  const gridQuery = useRegularizeDteQueryGrid(date);
  const statusMutation = useSetRegularizeDteQueryStatusMutation();
  const listsMutation = useImportRegularizeDteQueryListsMutation();
  const rows = gridQuery.data?.rows ?? [];
  const totals = gridQuery.data?.totals;

  async function submitLists() {
    try {
      await listsMutation.mutateAsync({ date, done, not_done: notDone });
      setDone("");
      setNotDone("");
    } catch {
      // O erro aparece pelo estado da mutation.
    }
  }

  return (
    <section className={regularizePanelClassName}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        Consultas diárias ao DTE
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Situação da consulta de cada cliente no dia. Entram os clientes de comércio ou indústria da
        BA com inscrição estadual e os que já têm registro na data.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className={regularizePanelLabelClassName}>
          Dia
          <input
            type="date"
            className={`${regularizeTextFieldClassName} mt-1.5`}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </label>
        {totals ? (
          <p className="text-sm text-slate-700 dark:text-slate-200" role="status">
            {totals.feita} feitas · {totals.nao_feita} não feitas · {totals.sem_registro} sem
            registro
          </p>
        ) : null}
      </div>

      {statusMutation.isError ? (
        <p role="alert" className={alertClassName}>
          {getRegularizeMutationErrorMessage(
            statusMutation.error,
            "Não foi possível alterar a situação da consulta. Tente novamente.",
          )}
        </p>
      ) : null}

      {!date ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Escolha um dia.</p>
      ) : gridQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando consultas…</p>
      ) : gridQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">
          Não foi possível carregar as consultas. Tente novamente.
        </p>
      ) : !rows.length ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          Nenhum cliente na grade deste dia. Confira segmento, UF e inscrição estadual no cadastro
          dos clientes.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className={cellClassName}>Razão social</th>
                <th className={cellClassName}>Nome fantasia</th>
                <th className={cellClassName}>CNPJ/CPF</th>
                <th className={cellClassName}>Consulta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800 dark:divide-slate-700 dark:text-slate-100">
              {rows.map((row) => (
                <tr key={row.client_id}>
                  <td className={cellClassName}>{row.name}</td>
                  <td className={cellClassName}>{row.fantasy_name ?? "—"}</td>
                  <td className={`${cellClassName} whitespace-nowrap`}>{row.cpf_cnpj || "—"}</td>
                  <td className={cellClassName}>
                    {canEdit ? (
                      <RegularizeNativeSelect
                        aria-label={`Consulta de ${row.name}`}
                        className="sm:w-44"
                        value={row.status}
                        disabled={statusMutation.isPending}
                        onChange={(event) =>
                          statusMutation.mutate({
                            client_id: row.client_id,
                            date,
                            status: event.target.value as RegularizeDteQueryStatus,
                          })
                        }
                      >
                        {REGULARIZE_DTE_QUERY_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </RegularizeNativeSelect>
                    ) : (
                      STATUS_LABELS[row.status]
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
            Registrar o dia por listas de CPF/CNPJ
          </summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitLists();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={regularizePanelLabelClassName}>
                Consultas feitas
                <textarea
                  className={`${regularizeTextareaClassName} mt-1.5 font-mono text-xs`}
                  value={done}
                  onChange={(event) => setDone(event.target.value)}
                  spellCheck={false}
                  disabled={listsMutation.isPending}
                />
              </label>
              <label className={regularizePanelLabelClassName}>
                Consultas não feitas
                <textarea
                  className={`${regularizeTextareaClassName} mt-1.5 font-mono text-xs`}
                  value={notDone}
                  onChange={(event) => setNotDone(event.target.value)}
                  spellCheck={false}
                  disabled={listsMutation.isPending}
                />
              </label>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Separe os documentos por vírgula ou linha. O registro vale para o dia escolhido acima
              e substitui a situação de quem estiver nas listas.
            </p>
            <button
              type="submit"
              disabled={listsMutation.isPending || !date || !(done.trim() || notDone.trim())}
              className={regularizePrimaryButtonClassName}
            >
              {listsMutation.isPending ? "Registrando…" : "Registrar listas"}
            </button>
          </form>

          {listsMutation.isError ? (
            <p role="alert" className={alertClassName}>
              {getRegularizeMutationErrorMessage(
                listsMutation.error,
                "Não foi possível registrar as listas. Confira os documentos e tente novamente.",
              )}
            </p>
          ) : null}
          {listsMutation.isSuccess ? (
            <div
              role="status"
              className={regularizePanelSuccessClassName}
            >
              Registro concluído: {listsMutation.data.done_count} feitas e{" "}
              {listsMutation.data.not_done_count} não feitas.
              {listsMutation.data.conflicts.length ? (
                <p className="mt-1">
                  Nas duas listas, não aplicados: {listsMutation.data.conflicts.join(", ")}.
                </p>
              ) : null}
              {listsMutation.data.unknown.length ? (
                <p className="mt-1">
                  Sem cliente com este documento: {listsMutation.data.unknown.join(", ")}.
                </p>
              ) : null}
            </div>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
