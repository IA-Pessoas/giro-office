import { ChevronDown } from "lucide-react";

import type { AssignableUser, RhCategory, RhRequestStatus } from "../types";
import { formatRhCategoryLabel, RH_REQUEST_STATUS_META } from "../utils/rhRequestUi";

interface RhRequestsFiltersProps {
  categories: RhCategory[];
  requesters?: AssignableUser[];
  selectedStatus: RhRequestStatus | "all";
  selectedCategoryId: string;
  selectedRequesterId?: string;
  title: string;
  description: string;
  onStatusChange: (value: RhRequestStatus | "all") => void;
  onCategoryChange: (value: string) => void;
  onRequesterChange?: (value: string) => void;
  onOpenCreate: () => void;
}

export function RhRequestsFilters({
  categories,
  requesters,
  selectedStatus,
  selectedCategoryId,
  selectedRequesterId,
  title,
  description,
  onStatusChange,
  onCategoryChange,
  onRequesterChange,
  onOpenCreate,
}: RhRequestsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Status</span>
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(event) =>
                onStatusChange(event.target.value as RhRequestStatus | "all")
              }
              className="min-w-[180px] appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">Todos</option>
              {Object.entries(RH_REQUEST_STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        {requesters && onRequesterChange ? (
          <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
            <span>Solicitante</span>
            <div className="relative">
              <select
                value={selectedRequesterId ?? ""}
                onChange={(event) => onRequesterChange(event.target.value)}
                className="min-w-[220px] appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Todos</option>
                {requesters.map((requester) => (
                  <option key={requester.id} value={requester.id}>
                    {requester.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          <span>Categoria</span>
          <div className="relative">
            <select
              value={selectedCategoryId}
              onChange={(event) => onCategoryChange(event.target.value)}
              className="min-w-[220px] appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-12 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatRhCategoryLabel(category.name)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </label>

        <button
          type="button"
          onClick={onOpenCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Nova solicitação
        </button>
      </div>
    </div>
  );
}
