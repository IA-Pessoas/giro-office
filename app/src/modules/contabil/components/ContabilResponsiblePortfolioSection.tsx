import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ChevronDown, Loader2, Plus, RotateCcw, Save, UserCog } from "lucide-react";

import { useAssignableUsers } from "@modules/rh";
import type { AssignableUser } from "@modules/rh/types";
import { Dialog } from "@shared/components";

import {
  useContabilControlPortfolio,
  useContabilResponsible,
  useCreateContabilResponsibleMutation,
} from "../hooks";
import { getContabilErrorMessage } from "../services";
import type { ContabilControlPortfolioItem } from "../types";
import {
  formatContabilCount,
  getCurrentContabilCompetence,
} from "./contabilControlSection.helpers";
import { ContabilCompanyPicker } from "./ContabilCompanyPicker";
import { ContabilStateBox } from "./ContabilStateBox";
import {
  buildContabilResponsibleFormValues,
  getContabilSelectLabel,
  mapAssignableUsersToContabilOptions,
  type ContabilResponsibleFormValues,
} from "./contabilPartySection.helpers";

const SECONDARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";
const PRIMARY_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

export function ContabilResponsiblePortfolioSection({ canEdit }: { canEdit: boolean }) {
  const portfolioQuery = useContabilControlPortfolio(getCurrentContabilCompetence());
  const companies = portfolioQuery.data?.items ?? [];
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [createClient, setCreateClient] = useState<ContabilControlPortfolioItem | null>(null);
  const [formValues, setFormValues] = useState<ContabilResponsibleFormValues>(
    buildContabilResponsibleFormValues(null),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateContabilResponsibleMutation();
  const assignableUsersQuery = useAssignableUsers({
    enabled: selectedClientIds.length > 0 || Boolean(createClient),
    module: "contabil",
  });
  const assignableOptions = useMemo(
    () => mapAssignableUsersToContabilOptions(assignableUsersQuery.data ?? []),
    [assignableUsersQuery.data],
  );
  const selectedCompanies = companies.filter((company) => selectedClientIds.includes(company.client_id));

  function startCreate(company: ContabilControlPortfolioItem) {
    setSubmitError(null);
    setFormValues(buildContabilResponsibleFormValues(null));
    setCreateClient(company);
  }

  function closeCreate() {
    if (createMutation.isPending) return;
    setCreateClient(null);
    setSubmitError(null);
    setFormValues(buildContabilResponsibleFormValues(null));
  }

  function handleFieldChange<K extends keyof ContabilResponsibleFormValues>(
    field: K,
    value: ContabilResponsibleFormValues[K],
  ) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createClient) return;
    setSubmitError(null);

    try {
      await createMutation.mutateAsync({
        client_id: createClient.client_id,
        person_responsible_id: formValues.person_responsible_id || undefined,
        posted_by_id: formValues.posted_by_id || undefined,
        customer_with_movement: formValues.customer_with_movement,
      });
      setCreateClient(null);
      setFormValues(buildContabilResponsibleFormValues(null));
    } catch (error) {
      setSubmitError(getContabilErrorMessage(error));
    }
  }

  if (portfolioQuery.isLoading) {
    return <ContabilStateBox icon={Loader2} tone="loading" title="Carregando empresas" compact>Buscando empresas elegíveis para o módulo contábil.</ContabilStateBox>;
  }

  if (portfolioQuery.isError) {
    return (
      <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar as empresas">
        <span>{getContabilErrorMessage(portfolioQuery.error)}</span>
        <button
          type="button"
          onClick={() => void portfolioQuery.refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold hover:bg-red-100 dark:border-red-900/50 dark:hover:bg-red-900/30"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Tentar novamente
        </button>
      </ContabilStateBox>
    );
  }

  if (companies.length === 0) {
    return <ContabilStateBox icon={UserCog} title="Nenhuma empresa elegível">Não há empresas contábeis disponíveis para esta competência.</ContabilStateBox>;
  }

  return (
    <section className="space-y-4" aria-labelledby="contabil-responsible-portfolio-title">
      <div>
        <h2 id="contabil-responsible-portfolio-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Responsáveis por empresa
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          Selecione as empresas para consultar e cadastrar responsáveis contábeis.
        </p>
      </div>

      {!showTable ? (
        <div className="space-y-4">
          <ContabilCompanyPicker
            companies={companies}
            selectedIds={selectedClientIds}
            onSelectionChange={setSelectedClientIds}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowTable(true)}
              disabled={selectedClientIds.length === 0}
              className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ver responsáveis
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-gray-700 dark:text-slate-300">
              {formatContabilCount(selectedCompanies.length, "empresa selecionada", "empresas selecionadas")}
            </p>
            <button
              type="button"
              onClick={() => setShowTable(false)}
              className={SECONDARY_BUTTON_CLASSNAME}
            >
              Alterar empresas
            </button>
          </div>

          {assignableUsersQuery.isError ? (
            <ContabilStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar os responsáveis disponíveis" compact>
              {getContabilErrorMessage(assignableUsersQuery.error)}
            </ContabilStateBox>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Empresa</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Responsável principal</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Lançado por</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Movimentação</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {/* ponytail: one lookup per company uses the current API.
                    Add a bulk route if large selections are slow. */}
                {selectedCompanies.map((company) => (
                  <ContabilResponsiblePortfolioRow
                    key={company.client_id}
                    company={company}
                    canEdit={canEdit}
                    users={assignableUsersQuery.data ?? []}
                    usersLoading={assignableUsersQuery.isLoading}
                    onCreate={() => startCreate(company)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog
        open={Boolean(createClient)}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
        title="Cadastrar responsável contábil"
        description={createClient?.legal_name ?? "Cadastro do responsável contábil"}
        contentClassName="w-[min(92vw,760px)]"
        bodyClassName="space-y-4"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ResponsibleSelect
              label="Responsável principal"
              value={formValues.person_responsible_id}
              options={assignableOptions}
              disabled={!canEdit || assignableUsersQuery.isLoading}
              onChange={(value) => handleFieldChange("person_responsible_id", value)}
            />
            <ResponsibleSelect
              label="Lançado por"
              value={formValues.posted_by_id}
              options={assignableOptions}
              disabled={!canEdit || assignableUsersQuery.isLoading}
              onChange={(value) => handleFieldChange("posted_by_id", value)}
            />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <input
              type="checkbox"
              checked={formValues.customer_with_movement}
              onChange={(event) => handleFieldChange("customer_with_movement", event.target.checked)}
              disabled={!canEdit}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>O cliente possui movimentação e precisa de acompanhamento ativo neste fluxo contábil.</span>
          </label>
          {submitError ? <p role="alert" className="text-sm text-red-600 dark:text-red-300">{submitError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!canEdit || createMutation.isPending} className={PRIMARY_BUTTON_CLASSNAME}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Cadastrar responsável
            </button>
            <button type="button" onClick={closeCreate} disabled={createMutation.isPending} className={SECONDARY_BUTTON_CLASSNAME}>
              Cancelar
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

function ContabilResponsiblePortfolioRow({
  company,
  canEdit,
  users,
  usersLoading,
  onCreate,
}: {
  company: ContabilControlPortfolioItem;
  canEdit: boolean;
  users: AssignableUser[];
  usersLoading: boolean;
  onCreate: () => void;
}) {
  const responsibleQuery = useContabilResponsible(company.client_id);
  const responsible = responsibleQuery.data ?? null;
  const options = useMemo(
    () =>
      mapAssignableUsersToContabilOptions(users, [
        responsible?.person_responsible_id ?? "",
        responsible?.posted_by_id ?? "",
      ]),
    [users, responsible?.person_responsible_id, responsible?.posted_by_id],
  );

  return (
    <tr>
      <th scope="row" className="px-4 py-3 font-medium text-gray-900 dark:text-white">
        {company.legal_name}
      </th>
      {responsibleQuery.isLoading || usersLoading ? (
        <td colSpan={4} className="px-4 py-3 text-gray-500 dark:text-slate-400">Carregando cadastro...</td>
      ) : responsibleQuery.isError ? (
        <>
          <td colSpan={3} className="px-4 py-3 text-red-600 dark:text-red-300">Não foi possível carregar.</td>
          <td className="px-4 py-3">
            <button type="button" onClick={() => void responsibleQuery.refetch()} className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
              Tentar novamente
            </button>
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
            {getContabilSelectLabel(responsible?.person_responsible_id, options)}
          </td>
          <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
            {getContabilSelectLabel(responsible?.posted_by_id, options)}
          </td>
          <td className="px-4 py-3 text-gray-700 dark:text-slate-300">
            {responsible ? (responsible.customer_with_movement ? "Sim" : "Não") : "—"}
          </td>
          <td className="px-4 py-3">
            {!responsible && canEdit ? (
              <button
                type="button"
                onClick={onCreate}
                aria-label={`Cadastrar responsável para ${company.legal_name}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Cadastrar
              </button>
            ) : responsible ? (
              <span className="text-sm text-gray-500 dark:text-slate-400">Cadastrado</span>
            ) : (
              <span className="text-sm text-gray-500 dark:text-slate-400">Sem cadastro</span>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

function ResponsibleSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: ReturnType<typeof mapAssignableUsersToContabilOptions>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-slate-300">
      <span>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-11 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Não definido</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </div>
    </label>
  );
}
