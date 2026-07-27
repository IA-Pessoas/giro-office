import { useMemo, useState } from "react";

import { PaginationControls } from "@shared/components";
import { useDebouncedValue } from "@shared/hooks";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import {
  usePaginatedRegularizeClientPfs,
  useRegularizeClientPfDetail,
} from "../hooks/useRegularizePeople";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

const PF_SELECT_PAGE_SIZE = 20;

export type RegularizeClientPfSelectOption = {
  id: string;
  label: string;
  cpf?: string | null;
};

function toOption(clientPf: RegularizeClientPfSelectOption): RegularizeClientPfSelectOption {
  return clientPf;
}

export function RegularizeClientPfSelect({
  onChange,
  value,
}: {
  onChange: (id: string, option?: RegularizeClientPfSelectOption) => void;
  value: string;
}) {
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

  const options = useMemo<RegularizeClientPfSelectOption[]>(() => {
    const pageOptions = (listQuery.data?.data ?? []).map((clientPf) =>
      toOption({
        id: clientPf.id,
        label: clientPf.name || clientPf.id,
        cpf: clientPf.cpf,
      }),
    );
    const selected = selectedPfQuery.data;

    if (!selected || pageOptions.some((option) => option.id === selected.id)) {
      return pageOptions;
    }

    return [
      toOption({ id: selected.id, label: selected.name || selected.id, cpf: selected.cpf }),
      ...pageOptions,
    ];
  }, [listQuery.data, selectedPfQuery.data]);

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPfPage(1);
        }}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        placeholder="Buscar PF por nome, código ou CPF"
      />
      <RegularizeNativeSelect
        value={value}
        onChange={(event) => {
          const option = options.find((candidate) => candidate.id === event.target.value);
          onChange(event.target.value, option);
        }}
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.cpf ? `, ${formatCPF_CNPJ(option.cpf)}` : ""}
          </option>
        ))}
      </RegularizeNativeSelect>
      <PaginationControls
        page={pfPage}
        limit={PF_SELECT_PAGE_SIZE}
        total={listQuery.data?.total ?? 0}
        count={listQuery.data?.data.length ?? 0}
        hasMore={listQuery.data?.hasMore ?? false}
        isFetching={listQuery.isFetching || isSearchPending}
        onPrevious={() => setPfPage((current) => Math.max(1, current - 1))}
        onNext={() => setPfPage((current) => current + 1)}
      />
    </div>
  );
}
