import { useState } from "react";
import { Loader2 } from "lucide-react";

import { getContabilErrorMessage, getCurrentContabilCompetence } from "@modules/contabil";

import { useTriageSolicitationIndicators } from "../hooks";
import type { TriageSolicitationStatus } from "../services";
import { TRIAGE_FIELD_CLASSNAME } from "./triagem.styles";

function userLabel(user: { name: string | null; full_name: string | null }): string {
  return user.name || user.full_name || "Não identificado";
}

function BarList({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: Array<{ key: string; label: string; value: number; detail?: string }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Sem dados na competência.</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label={title}>
          {rows.map((row) => (
            <li key={row.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-gray-700 dark:text-slate-300">{row.label}</span>
                <span className="shrink-0 font-medium text-gray-900 tabular-nums dark:text-white">
                  {row.value} {unit}
                </span>
              </div>
              <meter
                className="mt-1 block h-2 w-full"
                min={0}
                max={max}
                value={row.value}
                aria-label={`${row.label}: ${row.value} ${unit}`}
              />
              {row.detail ? (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{row.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TriageSolicitationIndicators({ status }: { status: TriageSolicitationStatus }) {
  const [competence, setCompetence] = useState<string>(getCurrentContabilCompetence());
  const query = useTriageSolicitationIndicators(competence, status);
  const data = query.data;

  return (
    <section
      className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-slate-700"
      aria-labelledby="triage-solicitation-indicators-title"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3
            id="triage-solicitation-indicators-title"
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            Indicadores {status === "OPEN" ? "das solicitações em andamento" : "das solicitações fechadas"}
          </h3>
          {data ? (
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {data.totals.solicitations} solicitações · {data.totals.clients} clientes ·{" "}
              {data.totals.notes} notas (cada cliente conta uma vez)
            </p>
          ) : null}
        </div>
        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
          Competência dos indicadores
          <input
            type="month"
            value={competence}
            onChange={(event) => setCompetence(event.target.value)}
            className={TRIAGE_FIELD_CLASSNAME}
          />
        </label>
      </div>
      {query.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando indicadores...
        </p>
      ) : query.error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar os indicadores. {getContabilErrorMessage(query.error)}
        </p>
      ) : data ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <BarList
            title="Notas por responsável"
            unit="notas"
            rows={data.notes_by_responsible.map((row) => ({
              key: row.user.id,
              label: userLabel(row.user),
              value: row.total,
              detail: `XML ${row.xml_inbound} entradas / ${row.xml_outbound} saídas · NFSE ${row.nfse_issued} prestadas / ${row.nfse_received} tomadas · ${row.clients} clientes`,
            }))}
          />
          <BarList
            title="Pedidos por solicitante"
            unit="pedidos"
            rows={data.solicitations_by_requester.map((row) => ({
              key: row.user.id,
              label: userLabel(row.user),
              value: row.total,
            }))}
          />
        </div>
      ) : null}
    </section>
  );
}
