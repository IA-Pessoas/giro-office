import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { ContabilControlPortfolioItem } from "../types";
import { formatContabilCount } from "./contabilControlSection.helpers";

interface ContabilCompanyPickerProps {
  companies: ContabilControlPortfolioItem[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export function ContabilCompanyPicker({
  companies,
  selectedIds,
  onSelectionChange,
}: ContabilCompanyPickerProps) {
  const [search, setSearch] = useState("");
  const visibleCompanies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return query
      ? companies.filter((company) => company.legal_name.toLocaleLowerCase("pt-BR").includes(query))
      : companies;
  }, [companies, search]);
  const selected = new Set(selectedIds);
  const allVisibleSelected =
    visibleCompanies.length > 0 && visibleCompanies.every((company) => selected.has(company.client_id));

  function toggleCompany(clientId: string) {
    const next = new Set(selectedIds);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    onSelectionChange([...next]);
  }

  function toggleVisibleCompanies() {
    const next = new Set(selectedIds);
    for (const company of visibleCompanies) {
      if (allVisibleSelected) {
        next.delete(company.client_id);
      } else {
        next.add(company.client_id);
      }
    }
    onSelectionChange([...next]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm font-medium text-gray-700 dark:text-slate-300">
          {formatContabilCount(selectedIds.length, "empresa selecionada", "empresas selecionadas")}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block sm:w-72">
            <span className="sr-only">Buscar empresa</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa..."
              className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={toggleVisibleCompanies}
            disabled={visibleCompanies.length === 0}
            className="h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
          </button>
        </div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {visibleCompanies.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
            Nenhuma empresa encontrada.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {visibleCompanies.map((company) => (
              <li key={company.client_id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60">
                  <input
                    type="checkbox"
                    checked={selected.has(company.client_id)}
                    onChange={() => toggleCompany(company.client_id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-white">
                    <span className="block truncate">{company.legal_name}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
