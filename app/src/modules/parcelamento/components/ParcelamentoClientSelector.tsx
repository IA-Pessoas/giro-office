import { useDeferredValue, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";

import { useClients } from "@modules/clients";
import { Dialog, PaginationControls } from "@shared/components";

import type { ParcelamentoClientOption } from "../types";
import { parcelamentoTextFieldClassName } from "./parcelamentoFormControls";

const CLIENT_PICKER_LIMIT = 50;
const FIRST_CLIENT_PAGE = 1;

interface ParcelamentoClientSelectorProps {
  selectedClient: ParcelamentoClientOption | null;
  onSelectClient: (client: ParcelamentoClientOption | null) => void;
}

export function ParcelamentoClientSelector({
  selectedClient,
  onSelectClient,
}: ParcelamentoClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(FIRST_CLIENT_PAGE);
  const deferredSearch = useDeferredValue(search.trim());
  const clientsQuery = useClients({
    status: "Ativo",
    // Sem o filtro legado ref=integracao: clientes do "Novo cliente" comum também entram (#1349).
    legacyIntegrationStatusFilter: false,
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

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(FIRST_CLIENT_PAGE);
  }

  function handleSelect(client: ParcelamentoClientOption | null) {
    onSelectClient(client);
    setIsOpen(false);
  }

  return (
    <div className="w-full max-w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="flex w-full min-w-44 max-w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-center text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:w-auto sm:max-w-80"
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

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Selecionar cliente"
        description="Busque por nome, razão social ou CPF/CNPJ. Só clientes ativos aparecem aqui."
        contentClassName="w-[min(92vw,520px)]"
        bodyClassName="max-h-[72vh] overflow-y-auto space-y-4"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Buscar cliente"
            // biome-ignore lint/a11y/noAutofocus: a busca é a única ação do diálogo de seleção.
            autoFocus
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar cliente"
            className={`${parcelamentoTextFieldClassName} pl-9`}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
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
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              <X className="h-4 w-4" />
              Não foi possível carregar clientes.
            </p>
          ) : clients.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
              Nenhum cliente disponível.
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
      </Dialog>
    </div>
  );
}
