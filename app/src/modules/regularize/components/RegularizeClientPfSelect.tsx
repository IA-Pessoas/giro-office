import { useMemo, useState } from "react";

import { Dialog, PaginationControls } from "@shared/components";
import { useDebouncedValue } from "@shared/hooks";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import {
  usePaginatedRegularizeClientPfs,
  useRegularizeClientPfDetail,
} from "../hooks/useRegularizePeople";

const PF_SELECT_PAGE_SIZE = 20;

export type RegularizeClientPfSelectOption = {
  id: string;
  label: string;
  cpf?: string | null;
};

export function RegularizeClientPfSelect({
  onChange,
  value,
}: {
  onChange: (id: string, option?: RegularizeClientPfSelectOption) => void;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pfPage, setPfPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const isSearchPending = search.trim() !== debouncedSearch;
  const listQuery = usePaginatedRegularizeClientPfs({
    status: "Todos",
    search: debouncedSearch,
    page: pfPage,
    limit: PF_SELECT_PAGE_SIZE,
  });
  const selectedPfQuery = useRegularizeClientPfDetail(value, { enabled: Boolean(value) });
  const error = listQuery.error ?? selectedPfQuery.error;
  const hasError = Boolean(error) || listQuery.isError || selectedPfQuery.isError;
  const isLoading = listQuery.isLoading || selectedPfQuery.isLoading;

  const options = useMemo<RegularizeClientPfSelectOption[]>(() => {
    const pageOptions = (listQuery.data?.data ?? []).map((clientPf) => ({
      id: clientPf.id,
      label: clientPf.name || clientPf.id,
      cpf: clientPf.cpf,
    }));
    const selected = selectedPfQuery.data;

    if (!selected || pageOptions.some((option) => option.id === selected.id)) {
      return pageOptions;
    }

    return [
      { id: selected.id, label: selected.name || selected.id, cpf: selected.cpf },
      ...pageOptions,
    ];
  }, [listQuery.data, selectedPfQuery.data]);

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PF_SELECT_PAGE_SIZE));
  const selectedOption = options.find((option) => option.id === value);

  function handleSearchChange(nextSearch: string) {
    setSearch(nextSearch);
    setPfPage(1);
  }

  function handleSelect(option?: RegularizeClientPfSelectOption) {
    onChange(option?.id ?? "", option);
    setIsOpen(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Selecionar cliente PF"
        onClick={() => setIsOpen(true)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 outline-none transition-colors hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {selectedOption?.label || selectedPfQuery.data?.name || "Selecionar cliente PF"}
          </span>
          {selectedOption?.cpf || selectedPfQuery.data?.cpf ? (
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
              {formatCPF_CNPJ(selectedOption?.cpf || selectedPfQuery.data?.cpf || "")}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-300">
          Alterar
        </span>
      </button>

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Selecionar cliente PF"
        description="Busque, selecione e navegue pelos clientes PF disponíveis."
        contentClassName="w-[min(92vw,560px)]"
        bodyClassName="max-h-[72vh] space-y-4 overflow-y-auto"
      >
        <input
          type="search"
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          placeholder="Nome, código ou CPF"
          aria-label="Buscar cliente PF"
        />
        {isLoading ? (
          <p role="status" aria-live="polite" className="text-sm text-gray-500 dark:text-gray-400">
            Carregando clientes PF...
          </p>
        ) : null}
        {hasError ? (
          <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-700 dark:text-red-300">
            <span>Não foi possível carregar clientes PF.</span>
            <button
              type="button"
              onClick={() => {
                if (listQuery.isError) {
                  void listQuery.refetch();
                }

                if (selectedPfQuery.isError) {
                  void selectedPfQuery.refetch();
                }
              }}
              className="font-medium underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        <div
          role="listbox"
          aria-label="Resultados de clientes PF"
          className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => handleSelect()}
            className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <span className="font-medium text-gray-900 dark:text-white">Nenhum cliente PF selecionado</span>
            {!value ? <span aria-hidden="true">✓</span> : null}
          </button>
          {isLoading ? null : options.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
              Nenhum cliente PF encontrado.
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => handleSelect(option)}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                    {option.label}
                  </span>
                  {option.cpf ? (
                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {formatCPF_CNPJ(option.cpf)}
                    </span>
                  ) : null}
                </span>
                {option.id === value ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))
          )}
        </div>
        <PaginationControls
          page={pfPage}
          limit={PF_SELECT_PAGE_SIZE}
          total={total}
          totalPages={totalPages}
          count={listQuery.data?.data.length ?? 0}
          hasMore={listQuery.data?.hasMore ?? false}
          isFetching={listQuery.isFetching || isSearchPending}
          onPrevious={() => setPfPage((current) => Math.max(1, current - 1))}
          onNext={() => setPfPage((current) => current + 1)}
          onPageChange={setPfPage}
        />
      </Dialog>
    </div>
  );
}
