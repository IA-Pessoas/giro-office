import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Landmark, Loader2, Plus, Search } from "lucide-react";

import { useFiscalIcmsList } from "../hooks";
import type { FiscalIcms } from "../types";
import {
  getFiscalErrorMessage,
  parseCommaSeparatedValues,
} from "../utils";

type FiscalIcmsPanelIntent =
  | { mode: "create" }
  | { mode: "edit"; icmsId: string }
  | null;

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[88px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function FiscalIcmsSection() {
  const [filterValue, setFilterValue] = useState("");
  const [submittedTerms, setSubmittedTerms] = useState<string[]>([]);
  const [hasSubmittedSearch, setHasSubmittedSearch] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [panelIntent, setPanelIntent] = useState<FiscalIcmsPanelIntent>(null);

  const listQuery = useFiscalIcmsList(submittedTerms, hasSubmittedSearch);
  const errorMessage = listQuery.error ? getFiscalErrorMessage(listQuery.error) : null;
  const submittedLabel = useMemo(() => submittedTerms.join(", "), [submittedTerms]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTerms = parseCommaSeparatedValues(filterValue);
    if (normalizedTerms.length === 0) {
      setValidationMessage("Informe ao menos uma descrição para buscar.");
      return;
    }

    setValidationMessage(null);
    setSubmittedTerms(normalizedTerms);
    setHasSubmittedSearch(true);
  }

  if (panelIntent) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPanelIntent(null)}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-gray-300 px-3 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Listagem
              </button>
              <div className="inline-flex h-8 items-center justify-center rounded-md bg-blue-50 px-3 text-[13px] font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                {panelIntent.mode === "edit" ? "Edição" : "Novo cadastro"}
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {panelIntent.mode === "edit" ? "Editar ICMS" : "Novo ICMS"}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {panelIntent.mode === "edit"
                    ? "Revise os campos do cadastro selecionado e salve quando terminar."
                    : "Prepare um novo cadastro de ICMS sem sair da aba atual."}
                </p>
              </div>

              {submittedTerms.length > 0 ? (
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Busca atual:{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {submittedLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-sm text-gray-600 dark:border-slate-700 dark:text-slate-400">
            O formulário de create/edit entra no próximo commit desta PR.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                <Landmark className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ICMS</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Consulte descrições cadastradas e mantenha os registros no mesmo fluxo.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPanelIntent({ mode: "create" })}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <Plus className="h-4 w-4" />
            Novo ICMS
          </button>
        </div>

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Descrições
            </span>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={filterValue}
                  onChange={(event) => {
                    setFilterValue(event.target.value);
                    if (validationMessage) {
                      setValidationMessage(null);
                    }
                  }}
                  placeholder="Ex.: autopeças, energia, bebidas"
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-lg bg-blue-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                Buscar
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Use vírgulas para buscar mais de uma descrição cadastrada.
            </p>
          </div>

          {validationMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {validationMessage}
            </div>
          ) : null}
        </form>
      </div>

      {!hasSubmittedSearch ? (
        <StateBox icon={Search} title="Informe as descrições e clique em buscar">
          Use a consulta sob demanda para listar apenas os registros de ICMS que fazem sentido neste momento.
        </StateBox>
      ) : null}

      {hasSubmittedSearch && listQuery.isLoading && !listQuery.data ? (
        <StateBox icon={Loader2} title="Buscando ICMS">
          Estamos consultando os registros para as descrições informadas.
        </StateBox>
      ) : null}

      {listQuery.error && !listQuery.data ? (
        <StateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a lista de ICMS">
          {errorMessage}
        </StateBox>
      ) : null}

      {listQuery.data ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {listQuery.data.length === 1
                  ? "1 registro encontrado"
                  : `${listQuery.data.length} registros encontrados`}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Busca atual: {submittedLabel}
              </p>
            </div>

            {listQuery.isFetching ? (
              <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando resultados
              </div>
            ) : null}
          </div>

          {listQuery.error ? (
            <StateBox icon={AlertCircle} tone="danger" title="Não foi possível atualizar a listagem">
              {errorMessage}
            </StateBox>
          ) : null}

          {listQuery.data.length > 0 ? (
            <FiscalIcmsTable
              items={listQuery.data}
              onEdit={(item) => setPanelIntent({ mode: "edit", icmsId: item.id })}
            />
          ) : (
            <StateBox icon={Landmark} title="Nenhum ICMS encontrado">
              Não localizamos registros para as descrições informadas. Revise a busca e tente novamente.
            </StateBox>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FiscalIcmsTable({
  items,
  onEdit,
}: {
  items: FiscalIcms[];
  onEdit: (item: FiscalIcms) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] divide-y divide-gray-200 dark:divide-slate-700">
          <thead className="bg-gray-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                UF
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                Descrição
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                Item
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                CEST
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                Convênio
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                MVA aplicada
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                MVA ajustada
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                MVA original
              </th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-gray-50 dark:hover:bg-slate-800/30">
                <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {item.state}
                </td>
                <td className="min-w-[280px] px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.description}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.item_number ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.cest_code ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.interstate_agreement ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.applied_original_mva ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.adjusted_mva ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                  {item.original_mva ?? "—"}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className={`${ACTION_BUTTON_CLASSNAME} border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20`}
                    >
                      Editar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StateBox({
  children,
  icon: Icon,
  title,
  tone = "neutral",
}: {
  children: React.ReactNode;
  icon: typeof Search;
  title: string;
  tone?: "danger" | "neutral";
}) {
  const iconClasses =
    tone === "danger"
      ? "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-300"
      : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300";

  return (
    <div
      className={`rounded-xl border px-4 py-5 ${
        tone === "danger"
          ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
          : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClasses}`}>
          <Icon className={`h-4 w-4 ${title === "Buscando ICMS" ? "animate-spin" : ""}`} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400">{children}</p>
        </div>
      </div>
    </div>
  );
}
