import { useDeferredValue, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

import { useClients } from "@modules/clients";

import type { PessoalClientOption } from "../types";
import { pessoalTextFieldClassName } from "./pessoalFormControls";

const CLIENT_PICKER_LIMIT = 50;

interface PessoalClientSelectorProps {
  selectedClient: PessoalClientOption | null;
  onSelectClient: (client: PessoalClientOption | null) => void;
}

export function PessoalClientSelector({
  selectedClient,
  onSelectClient,
}: PessoalClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const clientsQuery = useClients({
    status: "Ativo",
    search: deferredSearch,
    page,
    limit: CLIENT_PICKER_LIMIT,
  });
  const clients = (clientsQuery.data?.items ?? []).map((client) => ({
    id: client.id,
    name: client.company_name || client.name,
    document: client.cpf_cnpj,
  }));
  const total = clientsQuery.data?.total ?? 0;
  const pageSize = clientsQuery.data?.pageSize ?? CLIENT_PICKER_LIMIT;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPreviousPage = page > 1;
  const hasNextPage = Boolean(clientsQuery.data?.hasMore) || page < totalPages;

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handlePageChange(value: string) {
    const nextPage = Math.trunc(Number(value));

    if (!Number.isFinite(nextPage)) {
      return;
    }

    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  }

  function handleSelect(client: PessoalClientOption | null) {
    onSelectClient(client);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full max-w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="flex w-full min-w-44 max-w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-center text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:max-w-80"
      >
        <span className="min-w-0 text-center">
          <span className="block truncate text-sm font-semibold">
            {selectedClient?.name || "Selecionar cliente"}
          </span>
          {selectedClient?.document ? (
            <span className="mt-0.5 block truncate text-xs text-blue-100">
              {selectedClient.document}
            </span>
          ) : null}
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pessoal-client-selector-title"
            className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="pessoal-client-selector-title"
                  className="text-base font-semibold text-gray-900 dark:text-white"
                >
                  Selecionar cliente
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Busque por nome, razão social ou CPF/CNPJ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Fechar seleção de cliente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Buscar cliente"
                className={`${pessoalTextFieldClassName} pl-9`}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                role="option"
                aria-selected={!selectedClient}
                onClick={() => handleSelect(null)}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Sem cliente selecionado
                </span>
                {!selectedClient ? (
                  <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                ) : null}
              </button>
              {clientsQuery.isLoading ? (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando clientes...
                </p>
              ) : clientsQuery.isError ? (
                <p className="px-4 py-3 text-sm text-red-600 dark:text-red-300">
                  Não foi possível carregar clientes.
                </p>
              ) : clients.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  Nenhum cliente disponível
                </p>
              ) : (
                <div role="listbox" className="max-h-80 overflow-y-auto">
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={client.id === selectedClient?.id}
                      onClick={() => handleSelect(client)}
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                          {client.name}
                        </span>
                        {client.document ? (
                          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                            {client.document}
                          </span>
                        ) : null}
                      </span>
                      {client.id === selectedClient?.id ? (
                        <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                Página
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={page}
                  onChange={(event) => handlePageChange(event.target.value)}
                  className="h-8 w-14 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                de {totalPages}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPreviousPage || clientsQuery.isFetching}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNextPage || clientsQuery.isFetching}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
