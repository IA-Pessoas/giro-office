import { useState, type FormEvent } from "react";
import { Check, ChevronDown, ChevronUp, ClipboardList, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { ConfirmationDialog } from "@shared/components";

import { getContabilErrorMessage } from "@modules/contabil";
import { useAssignableUsers } from "@modules/rh";

import { useTriageCatalogs, useTriageSolicitationMutations, useTriageSolicitations } from "../hooks";
import type { TriageSolicitation, TriageSolicitationStatus } from "../services";
import { TriageSolicitationDetail } from "./TriageSolicitationDetail";
import { TriageSolicitationIndicators } from "./TriageSolicitationIndicators";
import { triageUserLabel as userLabel } from "./triagem.helpers";

import {
  TRIAGE_BUTTON_CLASSNAME as BUTTON_CLASSNAME,
  TRIAGE_FIELD_CLASSNAME as FIELD_CLASSNAME,
  TRIAGE_PRIMARY_BUTTON_CLASSNAME as PRIMARY_BUTTON_CLASSNAME,
} from "./triagem.styles";

const TABS: Array<{ value: TriageSolicitationStatus; label: string }> = [
  { value: "OPEN", label: "Em andamento" },
  { value: "CLOSED", label: "Fechadas" },
];


function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function TriageSolicitationsSection({
  client,
  canEdit,
  canViewFiscal,
  canEditFiscal,
}: {
  client: { id: string; name: string } | null;
  canEdit: boolean;
  canViewFiscal: boolean;
  canEditFiscal: boolean;
}) {
  const [status, setStatus] = useState<TriageSolicitationStatus>("OPEN");
  const [detailId, setDetailId] = useState<string | null>(null);
  const solicitationsQuery = useTriageSolicitations(status);
  const mutations = useTriageSolicitationMutations();
  const categoriesQuery = useTriageCatalogs("REQUEST_CATEGORY");
  const usersQuery = useAssignableUsers({ enabled: canEdit, module: "triagem" });
  const [competence, setCompetence] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<TriageSolicitation | null>(null);
  const categories = categoriesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const solicitations = solicitationsQuery.data ?? [];
  const error = solicitationsQuery.error ?? categoriesQuery.error ?? usersQuery.error ?? mutations.create.error;

  async function createSolicitation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!client) return;
    const invalid = !competence
      ? "Informe a competência."
      : !categoryId
        ? "Selecione a categoria."
        : !responsibleId
          ? "Selecione o responsável."
          : !description.trim()
            ? "Descreva a solicitação."
            : null;
    setFormError(invalid);
    if (invalid) return;
    try {
      await mutations.create.mutateAsync({
        client_id: client.id,
        competence,
        category_id: categoryId,
        responsible_id: responsibleId,
        description: description.trim(),
      });
    } catch {
      return; // mensagem da API aparece no alerta da seção
    }
    setDescription("");
    setStatus("OPEN");
  }

  async function confirmClose(): Promise<void> {
    if (!pendingClose) return;
    try {
      await mutations.close.mutateAsync(pendingClose.id);
    } catch {
      return; // o diálogo mostra o erro da API
    }
    setPendingClose(null);
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      aria-labelledby="triage-solicitations-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="triage-solicitations-title"
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
          >
            <ClipboardList className="h-5 w-5 text-blue-600" aria-hidden="true" />
            Solicitações
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Pedidos por cliente e competência, separados das solicitações urgentes.
          </p>
        </div>
        <div role="tablist" aria-label="Situação das solicitações" className="inline-flex rounded-lg border border-gray-200 p-1 dark:border-slate-700">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setStatus(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                status === tab.value
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <TriageSolicitationIndicators status={status} />

      {canEdit && client ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={createSolicitation} noValidate>
          <p className="text-sm text-gray-700 dark:text-slate-300 sm:col-span-3">
            Nova solicitação para <strong>{client.name}</strong>
          </p>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Competência
            <input
              type="month"
              aria-label="Competência da solicitação"
              value={competence}
              onChange={(event) => setCompetence(event.target.value)}
              className={FIELD_CLASSNAME}
            />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Categoria
            <select
              aria-label="Categoria da solicitação"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={FIELD_CLASSNAME}
            >
              <option value="" disabled>
                Selecione a categoria
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Responsável
            <select
              aria-label="Responsável da solicitação"
              value={responsibleId}
              onChange={(event) => setResponsibleId(event.target.value)}
              className={FIELD_CLASSNAME}
            >
              <option value="" disabled>
                Selecione o responsável
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300 sm:col-span-3">
            Descrição
            <textarea
              aria-label="Descrição da solicitação"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 block min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          {!categoriesQuery.isLoading && categories.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 sm:col-span-3">
              Nenhuma categoria cadastrada.{" "}
              <Link href="/triagem/catalogos" className="underline">
                Cadastre categorias de solicitação nos catálogos
              </Link>
              .
            </p>
          ) : null}
          <button
            type="submit"
            disabled={mutations.create.isPending || categories.length === 0}
            className={`${PRIMARY_BUTTON_CLASSNAME} sm:col-span-3 sm:justify-self-start`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Registrar solicitação
          </button>
          {formError ? (
            <p className="text-sm text-red-700 dark:text-red-300 sm:col-span-3" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar ou alterar as solicitações. {getContabilErrorMessage(error)}
        </p>
      ) : null}

      {solicitationsQuery.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando solicitações...
        </p>
      ) : solicitations.length === 0 ? (
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-slate-800/50 dark:text-slate-400">
          {status === "OPEN" ? "Nenhuma solicitação em andamento." : "Nenhuma solicitação fechada."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-slate-800" aria-label="Solicitações">
          {solicitations.map((solicitation) => (
            <li key={solicitation.id} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {solicitation.client.name} · {solicitation.competence} · {solicitation.category.label}
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">{solicitation.description}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Solicitada por {userLabel(solicitation.requester)} em {formatDate(solicitation.created_at)} ·
                  responsável: {userLabel(solicitation.responsible)}
                  {solicitation.closed_at ? ` · fechada em ${formatDate(solicitation.closed_at)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASSNAME}
                  aria-expanded={detailId === solicitation.id}
                  onClick={() => setDetailId(detailId === solicitation.id ? null : solicitation.id)}
                >
                  {detailId === solicitation.id ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  Detalhe
                </button>
                {canEdit && solicitation.status === "OPEN" ? (
                  <button
                    type="button"
                    className={BUTTON_CLASSNAME}
                    onClick={() => setPendingClose(solicitation)}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Fechar
                  </button>
                ) : null}
              </div>
              </div>
              {detailId === solicitation.id ? (
                <TriageSolicitationDetail
                  solicitation={solicitation}
                  canEdit={canEdit}
                  canViewFiscal={canViewFiscal}
                  canEditFiscal={canEditFiscal}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={pendingClose !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingClose(null);
          mutations.close.reset();
        }}
        title="Fechar solicitação"
        description={`Fechar a solicitação de ${pendingClose?.client.name ?? ""} (${pendingClose?.competence ?? ""})? Ela não poderá ser reaberta.`}
        onConfirm={confirmClose}
        isConfirming={mutations.close.isPending}
        errorMessage={mutations.close.error ? getContabilErrorMessage(mutations.close.error) : null}
        confirmLabel="Fechar solicitação"
        cancelLabel="Cancelar"
        variant="neutral"
      />
    </section>
  );
}
