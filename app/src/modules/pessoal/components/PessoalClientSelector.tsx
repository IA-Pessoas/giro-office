import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import type { PessoalClientOption } from "../types";

interface PessoalClientSelectorProps {
  clients: PessoalClientOption[];
  selectedClientId: string;
  onSelectClient: (clientId: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}

export function PessoalClientSelector({
  clients,
  selectedClientId,
  onSelectClient,
  isLoading = false,
  isError = false,
}: PessoalClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedClient = clients.find((client) => client.id === selectedClientId);

  function handleSelect(clientId: string) {
    onSelectClient(clientId);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full sm:w-80 lg:w-96">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
            {selectedClient?.name || "Selecionar cliente"}
          </span>
          {selectedClient?.document ? (
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
              {selectedClient.document}
            </span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
          {isLoading ? (
            <p className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
              Carregando clientes...
            </p>
          ) : isError ? (
            <p className="px-3 py-2 text-sm text-red-600 dark:text-red-300">
              Nao foi possivel carregar clientes.
            </p>
          ) : clients.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
              Nenhum cliente disponivel
            </p>
          ) : (
            <div role="listbox" className="space-y-1">
              <button
                type="button"
                role="option"
                aria-selected={selectedClientId === ""}
                onClick={() => handleSelect("")}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Todos os clientes
                {selectedClientId === "" ? <Check className="h-4 w-4" /> : null}
              </button>
              {clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={client.id === selectedClientId}
                  onClick={() => handleSelect(client.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
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
                  {client.id === selectedClientId ? (
                    <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
