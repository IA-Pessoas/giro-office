import { DocumentIssueBadge } from "@shared/components/DocumentIssueBadge";
import { cn } from "@shared/ui/newLayout/utils";
import { formatCPF_CNPJ } from "@shared/utils/formatters";

import type { RegularizeProcessListItem } from "../types";
import type { RegularizeProcessBoardColumn } from "../utils/processBoard";
import { regularizeSecondaryButtonClassName } from "./regularizeFormControls";

type RegularizeProcessBoardProps = {
  columns: RegularizeProcessBoardColumn[];
  errorMessage?: string;
  getClientName: (item: RegularizeProcessListItem) => string;
  isLoading: boolean;
  onOpenProcessDetail: (processId: string) => void;
};

export function RegularizeProcessBoard({
  columns,
  errorMessage,
  getClientName,
  isLoading,
  onOpenProcessDetail,
}: RegularizeProcessBoardProps) {
  if (isLoading) {
    return (
      <p
        className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        role="status"
      >
        Carregando processos...
      </p>
    );
  }

  if (errorMessage) {
    return (
      <p
        className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        role="alert"
      >
        {errorMessage}
      </p>
    );
  }

  return (
    <div
      aria-label="Processos por status"
      className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3"
    >
      {columns.map((column) => {
        const headingId = `regularize-process-column-${column.status
          .toLowerCase()
          .replace(/\s+/g, "-")}`;

        return (
          <section
            aria-labelledby={headingId}
            className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50"
            key={column.status}
          >
            <header className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white" id={headingId}>
                {column.label}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {column.items.length}
              </span>
            </header>

            <div className="space-y-3">
              {column.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-5 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  Nenhum processo neste status.
                </p>
              ) : (
                column.items.map((item) => {
                  const clientName = getClientName(item);

                  return (
                    <article
                      className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                      key={item.id}
                    >
                      <div className="min-w-0">
                        <h4 className="break-words text-sm font-semibold text-gray-900 dark:text-white">
                          {item.process_type}
                        </h4>
                        <p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">
                          {clientName}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{formatCPF_CNPJ(item.cpf_cnpj)}</span>
                          <DocumentIssueBadge value={item.cpf_cnpj} />
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {column.status === "Outros"
                            ? item.status || "Sem status"
                            : column.label}
                        </span>
                        <button
                          aria-label={`Ver detalhes de ${item.process_type} de ${clientName}`}
                          className={cn(regularizeSecondaryButtonClassName, "shrink-0")}
                          onClick={() => onOpenProcessDetail(item.id)}
                          type="button"
                        >
                          Ver detalhe
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
