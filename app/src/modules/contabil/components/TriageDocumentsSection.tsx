import { useState } from "react";
import {
  AlertCircle,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";

import {
  useTriageMonthly,
  useTriageMutations,
  useTriageStatements,
  useTriageClosing,
} from "../hooks";
import { getContabilErrorMessage } from "../services";
import type {
  ContabilCompetence,
  TriageClosingStatus,
  TriageDocumentStatus,
} from "../types";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilStateBox } from "./ContabilStateBox";

const DOCUMENTS = [
  ["financial_transactions", "Movimentações financeiras"],
  ["inventory_control", "Controle de estoque"],
  ["accounts_payable_report", "Relatório de contas a pagar"],
  ["accounts_receivable_report", "Relatório de contas a receber"],
  ["card_statements", "Faturas de cartão"],
  ["loan_agreements", "Contratos de empréstimo"],
  ["bank_reconciliation", "Conciliação bancária"],
  ["bank_investments", "Investimentos bancários"],
  ["card_sales_report", "Relatório de vendas de cartão"],
] as const;
const STATUSES: Array<[TriageDocumentStatus, string]> = [
  ["PENDING", "Pendente"],
  ["COMPLETED", "Concluído"],
  ["ATTENTION", "Atenção"],
  ["NOT_PRESENT", "Não recebido"],
  ["NOT_APPLICABLE", "Não aplicável"],
];
const CLOSING_STATUSES: Array<[TriageClosingStatus, string]> = [
  ["NOT_RECEIVED", "Não recebido"],
  ["RECEIVED", "Recebido"],
  ["UNDER_REVIEW", "Em conferência"],
  ["CLOSED", "Fechado"],
  ["REOPENED", "Reaberto"],
];

export function TriageDocumentsSection({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const [competence, setCompetence] = useState<ContabilCompetence>(
    getCurrentContabilCompetence(),
  );
  const [bankId, setBankId] = useState("");
  const monthly = useTriageMonthly(clientId, competence);
  const mutations = useTriageMutations(clientId, competence);
  const statements = useTriageStatements(clientId, competence);
  const closing = useTriageClosing(clientId, competence);
  const record = monthly.data;

  if (monthly.isLoading)
    return (
      <ContabilStateBox icon={Loader2} title="Carregando pendências">
        Aguarde enquanto buscamos a competência selecionada.
      </ContabilStateBox>
    );
  if (monthly.isError)
    return (
      <ContabilStateBox
        icon={AlertCircle}
        tone="danger"
        title="Não foi possível carregar as pendências"
      >
        {getContabilErrorMessage(monthly.error)}
      </ContabilStateBox>
    );

  return (
    <section className="space-y-5" aria-labelledby="triage-documents-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="triage-documents-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Pendências documentais
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Nove documentos por competência. Itens não aplicáveis não entram no
            indicador.
          </p>
        </div>
        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
          Competência
          <input
            aria-label="Competência documental"
            type="month"
            value={competence}
            onChange={(event) =>
              setCompetence(event.target.value as ContabilCompetence)
            }
            className="ml-2 h-10 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </div>
      <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Fechamento recebido
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Estado independente das pendências documentais e do checklist mensal.
        </p>
        {canEdit ? (
          <select
            aria-label="Estado do fechamento recebido"
            value={closing.data?.status ?? "NOT_RECEIVED"}
            disabled={closing.isLoading || mutations.closing.isPending}
            onChange={(event) =>
              mutations.closing.mutate({
                status: event.target.value as TriageClosingStatus,
              })
            }
            className="mt-3 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {CLOSING_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-3 text-sm text-gray-700 dark:text-slate-300">
            {CLOSING_STATUSES.find(([value]) => value === closing.data?.status)?.[1] ??
              "Não recebido"}
          </p>
        )}
      </div>
      {!record ? (
        <ContabilStateBox
          icon={FileText}
          title="Nenhuma pendência iniciada nesta competência"
        >
          {canEdit ? (
            <button
              type="button"
              onClick={() => mutations.create.mutate()}
              disabled={mutations.create.isPending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Iniciar pendências
            </button>
          ) : (
            "Um editor contábil ou responsável de triagem pode iniciar a competência."
          )}
        </ContabilStateBox>
      ) : (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
            <strong>{record.summary.percentage}% concluído</strong> ·{" "}
            {record.summary.completed}/{record.summary.applicable} aplicáveis ·{" "}
            {record.summary.attention} em atenção
          </div>
          {canEdit ? (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              Marcar todos os itens abertos como
              <select
                aria-label="Marcar todos os documentos"
                defaultValue="PENDING"
                onChange={(event) =>
                  mutations.all.mutate({
                    id: record.id,
                    status: event.target.value as TriageDocumentStatus,
                  })
                }
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
              >
                {STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="divide-y overflow-hidden rounded-xl border border-gray-200 dark:divide-slate-800 dark:border-slate-700">
            {DOCUMENTS.map(([field, label]) => (
              <div
                key={field}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {label}
                </span>
                {canEdit ? (
                  <select
                    aria-label={`${label} status`}
                    value={record.checklist[field]}
                    onChange={(event) =>
                      mutations.item.mutate({
                        id: record.id,
                        field,
                        status: event.target.value as TriageDocumentStatus,
                      })
                    }
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    {STATUSES.map(([value, statusLabel]) => (
                      <option key={value} value={value}>
                        {statusLabel}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-gray-600 dark:text-slate-300">
                    {
                      STATUSES.find(
                        ([value]) => value === record.checklist[field],
                      )?.[1]
                    }
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Extratos por banco
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
              Registre somente um identificador operacional do banco; dados de
              conta não são solicitados.
            </p>
            {canEdit ? (
              <div className="mt-3 flex gap-2">
                <input
                  aria-label="Identificador do banco"
                  value={bankId}
                  onChange={(event) => setBankId(event.target.value)}
                  placeholder="Ex.: 341"
                  className="h-10 min-w-0 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
                />
                <button
                  type="button"
                  disabled={!bankId.trim() || mutations.statement.isPending}
                  onClick={() =>
                    mutations.statement.mutate(
                      {
                        clientId,
                        competence,
                        bankId: bankId.trim(),
                        status: "PENDING",
                      },
                      { onSuccess: () => setBankId("") },
                    )
                  }
                  className="rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Adicionar
                </button>
              </div>
            ) : null}
            <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-slate-300">
              {(statements.data ?? []).map((statement) => (
                <li key={statement.id}>
                  Banco {statement.bank_id}:{" "}
                  {STATUSES.find(([value]) => value === statement.status)?.[1]}
                </li>
              ))}
              {!statements.isLoading && (statements.data ?? []).length === 0 ? (
                <li>Nenhum marcador registrado.</li>
              ) : null}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
