import Link from "next/link";

import { formatDateTime } from "@shared/utils/dateFormat";

import { useClientLicitacaoBidders, useClientLicitacaoHistory } from "../hooks/useClients";
import { licitacaoLabel } from "../utils/regularizeForm";

const panelClassName =
  "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6";
const emptyClassName =
  "rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-400";
const errorClassName =
  "rounded-xl bg-rose-50 px-3 py-4 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200";

// Histórico da resposta de licitação na ficha Regularize (#1743).
export function ClientLicitacaoHistoryPanel({ clientId }: { clientId: string }) {
  const historyQuery = useClientLicitacaoHistory(clientId);
  const rows = historyQuery.data ?? [];

  return (
    <section className={panelClassName}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Histórico de licitação</h2>
      <div className="mt-4">
        {historyQuery.isLoading ? (
          <p role="status" className={emptyClassName}>
            Carregando histórico…
          </p>
        ) : historyQuery.error ? (
          <p role="alert" className={errorClassName}>
            Não foi possível carregar o histórico de licitação.
          </p>
        ) : rows.length ? (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:justify-between">
                <span className="text-slate-800 dark:text-slate-100">
                  {licitacaoLabel(row.previous_value)} → <strong>{licitacaoLabel(row.new_value)}</strong>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {row.actor.name ?? "Usuário removido"} · {formatDateTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={emptyClassName}>Nenhuma alteração de licitação registrada.</p>
        )}
      </div>
    </section>
  );
}

// Lista de licitantes do legado: Sim entre clientes ativos ou em inativação (#1743).
export function ClientLicitacaoBiddersPanel() {
  const biddersQuery = useClientLicitacaoBidders();
  const bidders = biddersQuery.data ?? [];

  return (
    <section className={panelClassName}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Licitantes</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Clientes com licitação Sim, ativos ou em processo de inativação.
        </p>
      </div>
      <div className="mt-4">
        {biddersQuery.isLoading ? (
          <p role="status" className={emptyClassName}>
            Carregando licitantes…
          </p>
        ) : biddersQuery.error ? (
          <p role="alert" className={errorClassName}>
            Não foi possível carregar os licitantes.
          </p>
        ) : bidders.length ? (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
            {bidders.map((client) => (
              <li key={client.id} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:justify-between">
                <Link
                  href={`/clients/${client.id}/regularize`}
                  className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  {client.name}
                </Link>
                <span className="text-slate-500 dark:text-slate-400">
                  {client.cpf_cnpj} · {client.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={emptyClassName}>Nenhum cliente licitante.</p>
        )}
      </div>
    </section>
  );
}
