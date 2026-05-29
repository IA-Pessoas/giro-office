import { useDeferredValue, useMemo, useState } from "react";
import Head from "next/head";
import { Loader2, Search, Users } from "lucide-react";

import { canSSRAuth } from "@modules/auth";
import { useClients } from "@modules/clients/hooks/useClients";
import {
  AccessDeniedPanel,
  ContabilShell,
  useContabilPermissions,
} from "@modules/contabil";

const CONTABIL_CLIENT_PICKER_LIMIT = 50;

export default function ContabilPage() {
  const { canViewContabil, canEditContabil, isLoading } = useContabilPermissions();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>();
  const [selectedClientName, setSelectedClientName] = useState<string>();
  const deferredSearch = useDeferredValue(search.trim());

  const clientsQuery = useClients({
    search: deferredSearch,
    page: 1,
    limit: CONTABIL_CLIENT_PICKER_LIMIT,
  });

  const clientItems = clientsQuery.data?.items ?? [];
  const hasSearchResults = clientItems.length > 0;
  const shouldShowEmptySearch = !clientsQuery.isLoading && deferredSearch.length > 0 && !hasSearchResults;

  const selectedClientSummary = useMemo(() => {
    if (!selectedClientId || !selectedClientName) {
      return null;
    }

    return {
      id: selectedClientId,
      name: selectedClientName,
    };
  }, [selectedClientId, selectedClientName]);

  function handleSelectClient(clientId: string, clientName: string) {
    setSelectedClientId(clientId);
    setSelectedClientName(clientName);
  }

  return (
    <>
      <Head>
        <title>Contábil</title>
      </Head>

      <div className="space-y-6">
        {isLoading ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Carregando permissões do módulo contábil...
          </section>
        ) : !canViewContabil ? (
          <AccessDeniedPanel />
        ) : (
          <ContabilShell
            key={selectedClientId ?? "without-client"}
            clientId={selectedClientId}
            clientName={selectedClientName}
            canEdit={canEditContabil}
            defaultTab={selectedClientId ? "control" : "client"}
            clientPickerContent={
            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Seleção de cliente
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-slate-400">
                        Escolha o cliente para abrir o fluxo contábil operacional.
                      </p>
                    </div>
                  </div>
                </div>

                {selectedClientSummary ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Cliente atual:{" "}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {selectedClientSummary.name}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-2.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Buscar cliente
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome, razão social ou CPF/CNPJ"
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Mostrando até {CONTABIL_CLIENT_PICKER_LIMIT} clientes por busca.
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-950/30">
                {clientsQuery.isLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando clientes...
                  </div>
                ) : shouldShowEmptySearch ? (
                  <div className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                    Nenhum cliente encontrado para a busca informada.
                  </div>
                ) : (
                  <div className="max-h-72 divide-y divide-gray-200 overflow-y-auto dark:divide-slate-700">
                    {clientItems.map((client) => {
                      const isActive = selectedClientId === client.id;

                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client.id, client.name)}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                            isActive
                              ? "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100"
                              : "hover:bg-white dark:hover:bg-slate-900/70"
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-semibold">{client.name}</p>
                            <p className="truncate text-sm text-gray-600 dark:text-slate-400">
                              {client.company_name || "Razão social não informada"}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-slate-400">
                            {client.cpf_cnpj}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            }
          />
        )}
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
