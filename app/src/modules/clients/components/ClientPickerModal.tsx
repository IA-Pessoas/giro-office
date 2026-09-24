import { PaginationControls } from "@shared/components";
import { Check, Loader2, Search, X } from "lucide-react";
import { type KeyboardEvent, useDeferredValue, useEffect, useId, useRef, useState } from "react";

import { useClients } from "../hooks/useClients";
import type { ClientListFilters } from "../types";

const CLIENT_PICKER_LIMIT = 50;
const FIRST_CLIENT_PAGE = 1;

export interface ClientPickerOption {
  id: string;
  name: string;
  document?: string | null;
}

interface ClientPickerModalProps {
  allowClearSelection?: boolean;
  filters: Omit<ClientListFilters, "search" | "page" | "limit">;
  onSelectClient: (client: ClientPickerOption | null) => void;
  selectedClient: ClientPickerOption | null;
  triggerLabel?: string;
}

export function ClientPickerModal({
  allowClearSelection = false,
  filters,
  onSelectClient,
  selectedClient,
  triggerLabel = "Selecionar cliente",
}: ClientPickerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(FIRST_CLIENT_PAGE);
  const searchInputId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const clientsQuery = useClients({
    ...filters,
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
  const totalPages = Math.max(FIRST_CLIENT_PAGE, Math.ceil(total / pageSize));

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleWindowKeyDown(event: WindowEventMap["keydown"]) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [isOpen]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(FIRST_CLIENT_PAGE);
  }

  function handleSelect(client: ClientPickerOption | null) {
    onSelectClient(client);
    setIsOpen(false);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    }
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
            {selectedClient?.name || triggerLabel}
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
            aria-labelledby="client-picker-title"
            onKeyDown={handleDialogKeyDown}
            className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="client-picker-title" className="text-base font-semibold text-gray-900 dark:text-white">
                  Selecionar cliente
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Busque por nome, razão social ou CPF/CNPJ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Fechar seleção de cliente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor={searchInputId} className="sr-only">
                Buscar cliente
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  id={searchInputId}
                  type="search"
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="Buscar cliente"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pl-9 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
                />
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              {allowClearSelection ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedClient}
                  onClick={() => handleSelect(null)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Sem cliente selecionado
                  </span>
                  {!selectedClient ? (
                    <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
                  ) : null}
                </button>
              ) : null}
              {clientsQuery.isLoading ? (
                <p className="flex items-center gap-2 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando clientes...
                </p>
              ) : clientsQuery.isError ? (
                <p role="alert" className="px-4 py-3 text-sm text-red-600 dark:text-red-300">
                  Não foi possível carregar clientes. Tente novamente.
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
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30 dark:border-gray-700 dark:hover:bg-gray-700"
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

            <PaginationControls
              page={page}
              limit={pageSize}
              total={total}
              count={clients.length}
              hasMore={Boolean(clientsQuery.data?.hasMore) && page < totalPages}
              isFetching={clientsQuery.isFetching}
              totalPages={totalPages}
              onFirst={() => setPage(FIRST_CLIENT_PAGE)}
              onPrevious={() => setPage((current) => Math.max(FIRST_CLIENT_PAGE, current - 1))}
              onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
              onLast={() => setPage(totalPages)}
              onPageChange={setPage}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
