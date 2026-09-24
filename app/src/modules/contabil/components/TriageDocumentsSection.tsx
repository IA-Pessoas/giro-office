import { useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
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
import { useTriageCatalogs } from "@modules/triagem";
import { getContabilErrorMessage } from "../services";
import type {
  ContabilCompetence,
  TriageClosingStatus,
  TriageDocumentField,
  TriageDocumentItemNotes,
  TriageDocumentStatus,
  TriageFiscalChecklistField,
  TriageDeliveryMethod,
  TriageRoutineType,
} from "../types";
import { getCurrentContabilCompetence } from "./contabilControlSection.helpers";
import { ContabilStateBox } from "./ContabilStateBox";

const CONTABIL_DOCUMENTS = [
  ["financial_transactions", "Movimentações financeiras"],
  ["triaged_transactions", "Movimentações triadas"],
  ["inventory_control", "Controle de estoque"],
  ["accounts_payable_report", "Relatório de contas a pagar"],
  ["accounts_receivable_report", "Relatório de contas a receber"],
  ["card_statements", "Faturas de cartão"],
  ["loan_agreements", "Contratos de empréstimo"],
  ["bank_reconciliation", "Conciliação bancária"],
  ["bank_investments", "Investimentos bancários"],
  ["card_sales_report", "Relatório de vendas de cartão"],
] as const;
const FISCAL_DOCUMENTS = [
  ["inbound_report", "Relatório de entradas"],
  ["outbound_report", "Relatório de saídas"],
  ["nfse_provided", "NFSe prestados"],
  ["nfse_received", "NFSe recebidos"],
  ["cte_documents", "Documentos CTe"],
  ["mei_documents", "Documentos MEI"],
  ["nfce_documents", "Documentos NFCe"],
  ["sped_fiscal", "SPED Fiscal"],
  ["sped_contributions", "SPED Contribuições"],
  ["nfce_received", "NFCe recebidos"],
  ["model_21_invoice", "Nota fiscal modelo 21"],
  ["cte_as_issuer", "CTe como emitente"],
  ["services_provided_as_mei", "Serviços prestados como MEI"],
] as const;
const STATUSES: Array<[TriageDocumentStatus, string]> = [
  ["PENDING", "Pendente"],
  ["COMPLETED", "Concluído"],
  ["ATTENTION", "Atenção"],
  ["UNDER_REVIEW", "Em revisão"],
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

type TriageDocumentFieldValue = TriageDocumentField | TriageFiscalChecklistField;
type TriageDocumentDraft = Record<
  string,
  { note: string; justification: string; state_site: string }
>;

function buildDocumentDrafts(
  notes: Record<string, TriageDocumentItemNotes> | undefined,
  documents: readonly (readonly [string, string])[],
): TriageDocumentDraft {
  return Object.fromEntries(
    documents.map(([field]) => [
      field,
      {
        note: notes?.[field]?.note ?? "",
        justification: notes?.[field]?.justification ?? "",
        state_site: notes?.[field]?.state_site ?? "",
      },
    ]),
  ) as TriageDocumentDraft;
}

export function TriageDocumentsSection({
  clientId,
  canEdit,
  canEditClosing,
  documentType = "CONTABIL",
}: {
  clientId: string;
  canEdit: boolean;
  canEditClosing: boolean;
  documentType?: TriageRoutineType;
}) {
  const documents = documentType === "FISCAL" ? FISCAL_DOCUMENTS : CONTABIL_DOCUMENTS;
  const titleId = documentType === "FISCAL"
    ? "triage-fiscal-documents-title"
    : "triage-contabil-documents-title";
  const [competence, setCompetence] = useState<ContabilCompetence>(
    getCurrentContabilCompetence(),
  );
  const [bankId, setBankId] = useState("");
  const [billingAmount, setBillingAmount] = useState("");
  const [documentDrafts, setDocumentDrafts] = useState<TriageDocumentDraft>(() =>
    buildDocumentDrafts(undefined, documents),
  );
  // Status escolhido ainda não confirmado pelo backend: em erro, o select mantém a escolha.
  const [statusDrafts, setStatusDrafts] = useState<Record<string, TriageDocumentStatus>>({});
  const monthly = useTriageMonthly(clientId, competence, documentType);
  const justifications = useTriageCatalogs("JUSTIFICATION", clientId, competence);
  const deliveryMethods = useTriageCatalogs("DELIVERY_METHOD", clientId, competence);
  const stateSites = useTriageCatalogs("STATE_SITE", clientId, competence);
  const mutations = useTriageMutations(clientId, competence, documentType);
  const statements = useTriageStatements(clientId, competence, documentType);
  const closing = useTriageClosing(clientId, competence, documentType);
  const record = monthly.data;
  const catalogError = justifications.error ?? deliveryMethods.error ?? stateSites.error;
  const catalogsLoading =
    justifications.isLoading || deliveryMethods.isLoading || stateSites.isLoading;
  const mutationError =
    mutations.create.error ??
    mutations.item.error ??
    mutations.all.error ??
    mutations.statement.error ??
    mutations.archiveStatement.error ??
    mutations.closing.error;
  const statementMutationPending =
    mutations.statement.isPending || mutations.archiveStatement.isPending;

  useEffect(() => {
    if (record) {
      setDocumentDrafts(buildDocumentDrafts(record.item_notes, documents));
      setStatusDrafts({});
      setBillingAmount(record.billing_amount ?? "");
    }
  }, [record]);

  function updateDocumentDraft(
    field: TriageDocumentFieldValue,
    key: "note" | "justification" | "state_site",
    value: string,
  ) {
    setDocumentDrafts((current) => ({
      ...current,
      [field]: { ...current[field], [key]: value },
    }));
  }

  function archiveBankStatement(bankIdToArchive: string) {
    if (window.confirm(`Arquivar o marcador do banco ${bankIdToArchive} nesta competência?`)) {
      mutations.archiveStatement.mutate({
        clientId,
        competence,
        bankId: bankIdToArchive,
      });
    }
  }

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
    <section className="space-y-5" aria-labelledby={titleId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id={titleId}
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {documentType === "FISCAL" ? "Pendências fiscais" : "Pendências documentais"}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            {documentType === "FISCAL"
              ? "Quatorze campos fiscais legados por competência; a obrigatoriedade vem do snapshot."
              : "Dez documentos por competência. Itens não aplicáveis não entram no indicador."}
          </p>
        </div>
        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
          Competência
          <input
            aria-label={
              documentType === "FISCAL"
                ? "Competência fiscal"
                : "Competência documental"
            }
            type="month"
            value={competence}
            onChange={(event) =>
              setCompetence(event.target.value as ContabilCompetence)
            }
            className="ml-2 h-10 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </div>
      {mutationError ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
        >
          {getContabilErrorMessage(mutationError)}
        </p>
      ) : null}
      {catalogError ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
        >
          Não foi possível carregar as opções catalogadas da competência. {getContabilErrorMessage(catalogError)}
        </p>
      ) : null}
      {documentType === "CONTABIL" ? (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Fechamento recebido
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Estado independente das pendências documentais e do checklist mensal.
          </p>
          {canEditClosing ? (
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
      ) : null}
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
            "Um editor da rotina ou responsável de triagem pode iniciar a competência."
          )}
        </ContabilStateBox>
      ) : (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
            <strong>{record.summary.percentage}% concluído</strong> ·{" "}
            {record.summary.completed}/{record.summary.applicable} aplicáveis ·{" "}
            {record.summary.attention} em atenção
          </div>
          {documentType === "FISCAL" ? (
            <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                Faturamento
                <div className="mt-2 flex gap-2">
                  <input
                    aria-label="Faturamento fiscal"
                    value={billingAmount}
                    onChange={(event) => setBillingAmount(event.target.value)}
                    maxLength={2000}
                    disabled={!canEdit}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() =>
                        mutations.item.mutate({
                          id: record.id,
                          field: "billing_amount",
                          value: billingAmount || null,
                        })
                      }
                      disabled={mutations.item.isPending}
                      className="rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60 dark:border-blue-800 dark:text-blue-200"
                    >
                      Salvar faturamento
                    </button>
                  ) : null}
                </div>
              </label>
            </div>
          ) : null}
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
            {documents.map(([field, label]) => (
              <div
                key={field}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {label}
                  {documentType === "FISCAL" ? (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-400">
                      {record.item_notes[field]?.required ? "Obrigatório" : "Opcional"}
                      {record.item_notes[field]?.priority
                        ? ` · prioridade ${record.item_notes[field].priority.toLowerCase()}`
                        : ""}
                    </span>
                  ) : null}
                </span>
                <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
                  {canEdit ? (
                    <select
                      aria-label={`${label} status`}
                      value={statusDrafts[field] ?? record.checklist[field]}
                      onChange={(event) => {
                        const status = event.target.value as TriageDocumentStatus;
                        setStatusDrafts((current) => ({ ...current, [field]: status }));
                        mutations.item.mutate({
                          id: record.id,
                          field,
                          status,
                          note: documentDrafts[field].note || null,
                          justification: documentDrafts[field].justification || null,
                          delivery_method: record.item_notes[field]?.delivery_method ?? null,
                          state_site: documentDrafts[field].state_site || null,
                        });
                      }}
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
                      {STATUSES.find(([value]) => value === record.checklist[field])?.[1]}
                    </span>
                  )}
                  {canEdit ? (
                    <div className="grid w-full gap-2 sm:min-w-[22rem] sm:grid-cols-2">
                      <label className="text-xs text-gray-600 dark:text-slate-300">
                        Nota
                        <textarea
                          aria-label={`${label} Nota`}
                          value={documentDrafts[field].note}
                          onChange={(event) =>
                            updateDocumentDraft(field, "note", event.target.value)
                          }
                          rows={2}
                          maxLength={2000}
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                        />
                      </label>
                      <label className="text-xs text-gray-600 dark:text-slate-300">
                        Justificativa
                        <select
                          aria-label={`${label} Justificativa`}
                          value={documentDrafts[field].justification}
                          disabled={catalogsLoading || Boolean(catalogError)}
                          onChange={(event) =>
                            updateDocumentDraft(field, "justification", event.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">Não definida</option>
                          {(justifications.data ?? []).map((item) => (
                            <option key={item.id} value={item.code}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {documentType === "FISCAL" ? (
                        <>
                          <label className="text-xs text-gray-600 dark:text-slate-300 sm:col-span-2">
                            Método de entrega
                            <select
                              aria-label={`${label} Método de entrega`}
                              value={record.item_notes[field]?.delivery_method ?? ""}
                              disabled={catalogsLoading || Boolean(catalogError)}
                              onChange={(event) =>
                                mutations.item.mutate({
                                  id: record.id,
                                  field,
                                  status: statusDrafts[field] ?? record.checklist[field],
                                  delivery_method: (event.target.value || null) as TriageDeliveryMethod | null,
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                            >
                              <option value="">Não definido</option>
                              {(deliveryMethods.data ?? []).map((item) => (
                                <option key={item.id} value={item.code}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-gray-600 dark:text-slate-300 sm:col-span-2">
                            Site estadual
                            <select
                              aria-label={`${label} Site estadual`}
                              value={documentDrafts[field].state_site}
                              disabled={catalogsLoading || Boolean(catalogError)}
                              onChange={(event) =>
                                updateDocumentDraft(field, "state_site", event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                            >
                              <option value="">Não definido</option>
                              {(stateSites.data ?? []).map((item) => (
                                <option key={item.id} value={item.code}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Salvar observações de ${label}`}
                        onClick={() =>
                          mutations.item.mutate({
                            id: record.id,
                            field,
                            status: statusDrafts[field] ?? record.checklist[field],
                            note: documentDrafts[field].note || null,
                            justification: documentDrafts[field].justification || null,
                            delivery_method: record.item_notes[field]?.delivery_method ?? null,
                            state_site: documentDrafts[field].state_site || null,
                          })
                        }
                        disabled={mutations.item.isPending}
                        className="justify-self-start rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 disabled:opacity-60 dark:border-blue-800 dark:text-blue-200 sm:col-span-2"
                      >
                        Salvar observações
                      </button>
                    </div>
                  ) : (
                    <div className="text-right text-xs text-gray-500 dark:text-slate-400">
                      {record.item_notes[field]?.note ? (
                        <p>Nota: {record.item_notes[field].note}</p>
                      ) : null}
                      {record.item_notes[field]?.justification ? (
                        <p>
                          Justificativa: {justifications.data?.find(
                            (item) => item.code === record.item_notes[field].justification,
                          )?.label ?? "Indisponível no catálogo ativo"}
                        </p>
                      ) : null}
                      {record.item_notes[field]?.delivery_method ? (
                        <p>
                          Método: {deliveryMethods.data?.find(
                            (item) => item.code === record.item_notes[field].delivery_method,
                          )?.label ?? "Indisponível no catálogo ativo"}
                        </p>
                      ) : null}
                      {record.item_notes[field]?.state_site ? (
                        <p>
                          Site estadual: {stateSites.data?.find(
                            (item) => item.code === record.item_notes[field].state_site,
                          )?.label ?? "Indisponível no catálogo da competência"}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {documentType === "CONTABIL" ? (
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
                    disabled={
                      !bankId.trim() ||
                      statementMutationPending
                    }
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
              {statements.isLoading ? (
                <p className="mt-3 text-sm text-gray-600 dark:text-slate-400" role="status">
                  Carregando marcadores...
                </p>
              ) : null}
              {statements.isError ? (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
                  Não foi possível carregar os marcadores. {getContabilErrorMessage(statements.error)}
                </p>
              ) : null}
              <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-slate-300">
                {(statements.data ?? []).map((statement) => (
                  <li
                    key={statement.id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
                  >
                    <span>Banco {statement.bank_id}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {canEdit ? (
                        <select
                          aria-label={`Status do banco ${statement.bank_id}`}
                          value={statement.status}
                          disabled={statementMutationPending}
                          onChange={(event) =>
                            mutations.statement.mutate({
                              clientId,
                              competence,
                              bankId: statement.bank_id,
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
                        <span>
                          {STATUSES.find(([value]) => value === statement.status)?.[1]}
                        </span>
                      )}
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label={`Arquivar marcador do banco ${statement.bank_id}`}
                          disabled={statementMutationPending}
                          onClick={() => archiveBankStatement(statement.bank_id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          Arquivar
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!statements.isLoading &&
                !statements.isError &&
                (statements.data ?? []).length === 0 ? (
                  <li>Nenhum marcador registrado.</li>
                ) : null}
              </ul>
              </div>
          ) : null}
        </>
      )}
    </section>
  );
}
