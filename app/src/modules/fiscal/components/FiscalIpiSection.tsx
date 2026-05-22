import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, Percent, Plus, Search } from "lucide-react";

import { useFiscalIpiList } from "../hooks";
import type { FiscalIpi } from "../types";
import {
  getFiscalErrorMessage,
  parseCommaSeparatedCodes,
} from "../utils";
import { FiscalIpiFormPanel } from "./FiscalIpiFormPanel";
import { FiscalStateBox } from "./FiscalStateBox";

type FiscalIpiPanelIntent =
  | { mode: "create" }
  | { mode: "edit"; ipiId: string }
  | null;

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-8 min-w-[88px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const NCM_CODE_LENGTH = 8;

export function FiscalIpiSection() {
  const [filterValue, setFilterValue] = useState("");
  const [submittedCodes, setSubmittedCodes] = useState<string[]>([]);
  const [hasSubmittedSearch, setHasSubmittedSearch] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [panelIntent, setPanelIntent] = useState<FiscalIpiPanelIntent>(null);

  const listQuery = useFiscalIpiList(submittedCodes, hasSubmittedSearch);
  const errorMessage = listQuery.error ? getFiscalErrorMessage(listQuery.error) : null;
  const submittedLabel = useMemo(() => submittedCodes.join(", "), [submittedCodes]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCodes = parseCommaSeparatedCodes(filterValue);
    if (normalizedCodes.length === 0) {
      setValidationMessage("Informe ao menos um código NCM para buscar.");
      return;
    }

    if (normalizedCodes.some((code) => !/^\d{8}$/.test(code))) {
      setValidationMessage("Informe apenas códigos NCM com 8 dígitos.");
      return;
    }

    setValidationMessage(null);
    setSubmittedCodes(normalizedCodes);
    setHasSubmittedSearch(true);
  }

  if (panelIntent) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-2.5">
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

            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {panelIntent.mode === "edit" ? "Editar IPI" : "Novo IPI"}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                  {panelIntent.mode === "edit"
                    ? "Revise os campos do cadastro selecionado e salve quando terminar."
                    : "Preencha os dados fiscais para criar um novo cadastro de IPI."}
                </p>
              </div>

              {submittedCodes.length > 0 ? (
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Busca atual:{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {submittedLabel}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <FiscalIpiFormPanel
              mode={panelIntent.mode}
              ipiId={panelIntent.mode === "edit" ? panelIntent.ipiId : undefined}
              searchCodes={submittedCodes}
              onClose={() => setPanelIntent(null)}
              showHeader={false}
              bare
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                <Percent className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">IPI</h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Consulte códigos específicos e mantenha os registros de IPI no mesmo fluxo.
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
            Novo IPI
          </button>
        </div>

        <form className="mt-3 space-y-2.5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Códigos NCM
            </span>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={filterValue}
                  onChange={(event) => {
                    const normalizedValue = event.target.value.replace(/[^\d,]/g, "");

                    setFilterValue(normalizedValue);
                    if (validationMessage) {
                      setValidationMessage(null);
                    }
                  }}
                  placeholder="Ex.: 84719012, 84715010"
                  inputMode="numeric"
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
              Use vírgulas para consultar mais de um código NCM.
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
        <FiscalStateBox icon={Search} title="Informe os códigos NCM e clique em buscar" compact>
          Use a consulta sob demanda para listar apenas os IPIs que fazem sentido neste momento.
        </FiscalStateBox>
      ) : null}

      {hasSubmittedSearch && listQuery.isLoading && !listQuery.data ? (
        <FiscalStateBox icon={Loader2} tone="loading" title="Buscando IPIs" compact>
          Estamos consultando os registros para os códigos informados.
        </FiscalStateBox>
      ) : null}

      {listQuery.error && !listQuery.data ? (
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível carregar a lista de IPI" compact>
          {errorMessage}
        </FiscalStateBox>
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
            <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível atualizar a listagem" compact>
              {errorMessage}
            </FiscalStateBox>
          ) : null}

          {listQuery.data.length > 0 ? (
            <FiscalIpiTable
              items={listQuery.data}
              onEdit={(item) => setPanelIntent({ mode: "edit", ipiId: item.id })}
            />
          ) : (
            <FiscalStateBox icon={Percent} title="Nenhum IPI encontrado" compact>
              Não localizamos registros para os códigos informados. Revise a busca e tente novamente.
            </FiscalStateBox>
          )}
        </div>
      ) : null}
    </section>
  );
}

function FiscalIpiTable({
  items,
  onEdit,
}: {
  items: FiscalIpi[];
  onEdit: (item: FiscalIpi) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-slate-700">
        <thead className="bg-gray-50 dark:bg-slate-800/60">
          <tr>
            <th className="w-[22%] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
              NCM
            </th>
            <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
              EX
            </th>
            <th className="w-[40%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
              Descrição
            </th>
            <th className="w-[12%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
              Alíquota
            </th>
            <th className="w-[12%] px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-700 dark:text-slate-300">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
          {items.map((item) => (
            <tr key={item.id} className="align-top hover:bg-gray-50 dark:hover:bg-slate-800/30">
              <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                {item.ncm}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                {item.ex ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                {item.description ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                {item.aliquot ?? "—"}
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
  );
}
