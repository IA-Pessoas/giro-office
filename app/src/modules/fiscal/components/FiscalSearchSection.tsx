import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Landmark,
  Loader2,
  Percent,
  Search,
  ScrollText,
} from "lucide-react";

import { useFiscalNcmSearch } from "../hooks";
import type { FiscalNcmSearchResult } from "../types";
import { formatFiscalTaxRegime, getFiscalErrorMessage } from "../utils";
import { FiscalStateBox } from "./FiscalStateBox";

const ncmFieldLabels: Array<{
  key:
    | "tax_regime"
    | "ncm_code"
    | "federal_taxation_type"
    | "description"
    | "ncm_notes"
    | "cst_pis_outgoing"
    | "cst_cofins_outgoing"
    | "product_group"
    | "validity_start_date"
    | "information_source"
    | "reference_legislation"
    | "validity_end_date";
  label: string;
}> = [
  { key: "tax_regime", label: "Regime tributário" },
  { key: "ncm_code", label: "Código NCM" },
  { key: "federal_taxation_type", label: "Tributação federal" },
  { key: "description", label: "Descrição" },
  { key: "ncm_notes", label: "Observações" },
  { key: "cst_pis_outgoing", label: "CST PIS saída" },
  { key: "cst_cofins_outgoing", label: "CST COFINS saída" },
  { key: "product_group", label: "Grupo de produto" },
  { key: "validity_start_date", label: "Vigência inicial" },
  { key: "information_source", label: "Fonte da informação" },
  { key: "reference_legislation", label: "Legislação de referência" },
  { key: "validity_end_date", label: "Vigência final" },
];

const LAST_FISCAL_SEARCH_STORAGE_KEY = "fiscal:last-ncm-search";
const NCM_CODE_LENGTH = 8;

type StoredFiscalSearch = {
  code: string;
  result: FiscalNcmSearchResult;
};

export function FiscalSearchSection() {
  const [inputValue, setInputValue] = useState("");
  const [submittedCode, setSubmittedCode] = useState<string>();
  const [storedSearch, setStoredSearch] = useState<StoredFiscalSearch | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const searchQuery = useFiscalNcmSearch(submittedCode);
  const hasSearched = Boolean(submittedCode);
  // keepPreviousData devolve o resultado de outro código como placeholder: não exibir.
  const activeResult =
    submittedCode && !searchQuery.isPlaceholderData ? searchQuery.data : undefined;
  const storedResult =
    !submittedCode || storedSearch?.code === submittedCode ? storedSearch?.result : undefined;
  const displayedResult = activeResult ?? storedResult ?? null;
  const hasResultData = Boolean(displayedResult);
  const displayedLastSearch = submittedCode ?? storedSearch?.code ?? null;
  const errorMessage = searchQuery.error
    ? getFiscalErrorMessage(searchQuery.error)
    : null;
  const searchSummary = useMemo(() => {
    if (!displayedResult) {
      return null;
    }

    return {
      hasNcm: Boolean(displayedResult.ncm),
      icmsCount: displayedResult.icms.length,
      ipiCount: displayedResult.ipi.length,
    };
  }, [displayedResult]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawStoredSearch = window.localStorage.getItem(LAST_FISCAL_SEARCH_STORAGE_KEY);
    if (!rawStoredSearch) {
      return;
    }

    try {
      const parsedSearch = JSON.parse(rawStoredSearch) as Partial<StoredFiscalSearch>;
      if (
        typeof parsedSearch.code !== "string" ||
        !parsedSearch.code.trim() ||
        !parsedSearch.result
      ) {
        return;
      }

      const restoredSearch = {
        code: parsedSearch.code,
        result: parsedSearch.result as FiscalNcmSearchResult,
      };

      setStoredSearch(restoredSearch);
      setInputValue(restoredSearch.code);
    } catch {
      window.localStorage.removeItem(LAST_FISCAL_SEARCH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !submittedCode || !searchQuery.data) {
      return;
    }

    const nextStoredSearch = {
      code: submittedCode,
      result: searchQuery.data,
    };

    window.localStorage.setItem(
      LAST_FISCAL_SEARCH_STORAGE_KEY,
      JSON.stringify(nextStoredSearch),
    );
    setStoredSearch(nextStoredSearch);
  }, [submittedCode, searchQuery.data]);

  function rejectSearch(message: string) {
    setValidationMessage(message);
    setSubmittedCode(undefined);
    setStoredSearch(null);
    window.localStorage.removeItem(LAST_FISCAL_SEARCH_STORAGE_KEY);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCode = inputValue.trim();
    if (!trimmedCode) {
      rejectSearch("Informe um código NCM antes de buscar.");
      return;
    }

    if (!/^\d+$/.test(trimmedCode)) {
      rejectSearch("Informe apenas números no código NCM.");
      return;
    }

    if (trimmedCode.length !== NCM_CODE_LENGTH) {
      rejectSearch("Informe um código NCM com 8 dígitos.");
      return;
    }

    setValidationMessage(null);

    if (trimmedCode === submittedCode) {
      void searchQuery.refetch();
      return;
    }

    setSubmittedCode(trimmedCode);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Busca fiscal
                </h2>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Consulta agregada de NCM, ICMS e IPI por código NCM completo.
                </p>
              </div>
            </div>
          </div>

          {displayedLastSearch ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Última busca:{" "}
              <span className="font-medium text-gray-900 dark:text-white">{displayedLastSearch}</span>
            </div>
          ) : null}
        </div>

        <form className="mt-3 space-y-2.5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Código NCM
            </span>
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(event) => {
                    const normalizedValue = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, NCM_CODE_LENGTH);

                    setInputValue(normalizedValue);
                    if (validationMessage) {
                      setValidationMessage(null);
                    }
                  }}
                  placeholder="Ex.: 84719012"
                  inputMode="numeric"
                  maxLength={NCM_CODE_LENGTH}
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
              Busca manual por código NCM completo.
            </p>
          </div>

          {validationMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {validationMessage}
            </div>
          ) : null}
        </form>
      </div>

      {!hasSearched && !hasResultData ? (
        <FiscalStateBox icon={Search} title="Informe o código e clique em buscar">
          Use a busca manual para consultar o NCM principal e os registros relacionados de ICMS e IPI.
        </FiscalStateBox>
      ) : null}

      {hasSearched && searchQuery.isLoading && !hasResultData ? (
        <FiscalStateBox icon={Loader2} tone="loading" title="Buscando dados fiscais">
          Estamos consultando NCM, ICMS e IPI para o código informado.
        </FiscalStateBox>
      ) : null}

      {searchQuery.error && !hasResultData ? (
        <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível buscar os dados fiscais">
          {errorMessage}
        </FiscalStateBox>
      ) : null}

      {hasResultData ? (
        <div className="space-y-4">
          {searchQuery.isFetching ? (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Atualizando resultados da busca fiscal.</span>
            </div>
          ) : null}

          {searchSummary ? (
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard
                label="NCM"
                value={searchSummary.hasNcm ? "Encontrado" : "Não encontrado"}
              />
              <SummaryCard label="ICMS" value={searchSummary.icmsCount} />
              <SummaryCard label="IPI" value={searchSummary.ipiCount} />
            </div>
          ) : null}

          {searchQuery.error ? (
            <FiscalStateBox icon={AlertCircle} tone="danger" title="Não foi possível atualizar a busca">
              {errorMessage}
            </FiscalStateBox>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <SearchResultPanel
              icon={ScrollText}
              title="NCM"
              description="Registro principal encontrado para o código pesquisado."
            >
              {displayedResult?.ncm ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ncmFieldLabels.map((field) => (
                    <FieldCard
                      key={field.key}
                      label={field.label}
                      value={
                        field.key === "tax_regime"
                          ? formatFiscalTaxRegime(displayedResult.ncm.tax_regime)
                          : displayedResult.ncm[field.key] ?? null
                      }
                    />
                  ))}
                </div>
              ) : (
                <InlineEmptyState>
                  Nenhum NCM cadastrado foi encontrado para o código pesquisado.
                </InlineEmptyState>
              )}
            </SearchResultPanel>

            <SearchResultPanel
              icon={Landmark}
              title="ICMS"
              description="Registros relacionados retornados pela busca agregada."
            >
              {displayedResult && displayedResult.icms.length > 0 ? (
                <div className="space-y-3">
                  {displayedResult.icms.map((item) => (
                    <ResultCard
                      key={item.id}
                      title={item.description}
                      meta={[
                        ["UF", item.state],
                        ["Item", item.item_number],
                        ["CEST", item.cest_code],
                        ["Convênio", item.interstate_agreement],
                        ["MVA aplicada", item.applied_original_mva],
                        ["MVA ajustada", item.adjusted_mva],
                        ["MVA original", item.original_mva],
                      ]}
                    />
                  ))}
                </div>
              ) : (
                <InlineEmptyState>
                  Nenhum registro de ICMS foi encontrado para este NCM.
                </InlineEmptyState>
              )}
            </SearchResultPanel>

            <SearchResultPanel
              icon={Percent}
              title="IPI"
              description="Registros de IPI vinculados ao código NCM informado."
            >
              {displayedResult && displayedResult.ipi.length > 0 ? (
                <div className="space-y-3">
                  {displayedResult.ipi.map((item) => (
                    <ResultCard
                      key={item.id}
                      title={item.description || item.ncm}
                      meta={[
                        ["NCM", item.ncm],
                        ["EX", item.ex],
                        ["Alíquota", item.aliquot],
                      ]}
                    />
                  ))}
                </div>
              ) : (
                <InlineEmptyState>
                  Nenhum registro de IPI foi encontrado para este NCM.
                </InlineEmptyState>
              )}
            </SearchResultPanel>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SearchResultPanel({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Search;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{description}</p>
        </div>
      </div>

      {children}
    </section>
  );
}


function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const isTextStatus = typeof value === "string";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">{label}</p>
      <p
        className={`mt-2 font-semibold text-gray-900 dark:text-white ${
          isTextStatus ? "text-lg leading-6" : "text-xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function FieldCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-900 dark:text-white">
        {value && value.trim() ? value : "Não informado"}
      </p>
    </div>
  );
}

function ResultCard({
  meta,
  title,
}: {
  meta: Array<[string, string | null]>;
  title: string;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {meta.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400">
              {label}
            </dt>
            <dd className="mt-1 text-sm text-gray-700 dark:text-slate-200">
              {value && value.trim() ? value : "Não informado"}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function InlineEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-300">
      {children}
    </div>
  );
}
