import Link from "next/link";
import { useRouter } from "next/router";
import { useDeferredValue, useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";

import { useModuleAccess } from "@modules/auth";
import { ClientCreateModal } from "@modules/clients/components/ClientCreateModal";
import { ClientGroupsPanel } from "@modules/clients/components/ClientGroupsPanel";
import { useClients } from "@modules/clients/hooks/useClients";
import { mapClientStatusFromApi } from "@modules/clients/utils/statusMapper";
import { PaginationControls } from "@shared/components";
import { DocumentIssueBadge } from "@shared/components/DocumentIssueBadge";
import { DEFAULT_PAGE_SIZE } from "@shared/pagination/pagination";

const CLIENTS_GRADIENT_ICON_CLASSNAME =
  "bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20";

const CLIENTS_GRADIENT_BUTTON_CLASSNAME =
  "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20 transition-all hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]";

const CLIENTS_PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const CLIENTS_SUBPANEL_CLASSNAME =
  "rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/40";

const CLIENTS_INPUT_CLASSNAME =
  "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

const CLIENTS_SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

const statusClassNameByValue: Record<string, string> = {
  Ativo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Prospect: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Inativo: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Fechado: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }

  return value;
}

export function Clients() {
  const router = useRouter();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const canCreateClient = integracaoAccess.canEdit;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const limit = DEFAULT_PAGE_SIZE;

  const filters = useMemo(
    () => ({
      search: deferredSearch.trim() || undefined,
      status: status || undefined,
      legacyIntegrationStatusFilter: false,
      page,
      limit,
    }),
    [deferredSearch, page, status],
  );

  const clientsQuery = useClients(filters);
  const clientsPage = clientsQuery.data;
  const clients = clientsPage?.items ?? [];
  const total = clientsPage?.total ?? 0;
  const currentPage = clientsPage?.page ?? page;
  const pageSize = clientsPage?.pageSize ?? limit;
  const pageCount = total > 0 ? Math.ceil(total / pageSize) : 1;

  return (
    <div className="space-y-6">
      {canCreateClient ? (
        <ClientCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={(client) => void router.push(`/clients/${client.id}`)}
        />
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${CLIENTS_GRADIENT_ICON_CLASSNAME}`}
            >
              <Building2 className="h-6 w-6 text-white" />
            </div>
            Clientes
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Lista de clientes.</p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Link href="/clients/coringa" className="inline-flex w-fit items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800">Lista Coringa</Link>
          {canCreateClient ? (
            <>
              <Link
                href="/clients/integration/new"
                className={`inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-white ${CLIENTS_GRADIENT_BUTTON_CLASSNAME}`}
              >
                <Plus className="h-5 w-5" />
                Nova integração
              </Link>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className={`self-end lg:self-auto w-fit flex items-center gap-2 rounded-xl px-4 py-2.5 text-white ${CLIENTS_GRADIENT_BUTTON_CLASSNAME}`}
              >
                <Plus className="h-5 w-5" />
                Novo cliente
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
        <div className={`${CLIENTS_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">Busca</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nome ou CPF/CNPJ"
                className={CLIENTS_INPUT_CLASSNAME}
              />
            </div>
          </label>
        </div>

        <div className={`${CLIENTS_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px] bg-[position:right_1.25rem_center] bg-no-repeat px-3 py-2.5 pr-14 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              style={CLIENTS_SELECT_ARROW_STYLE}
            >
              <option value="">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Prospect">Prospect</option>
              <option value="Inativo">Inativo</option>
              <option value="Fechado">Fechado</option>
            </select>
          </label>
        </div>

        <div className={`${CLIENTS_SUBPANEL_CLASSNAME} flex flex-col justify-center p-4`}>
          <span className="text-sm text-slate-500 dark:text-slate-400">Total encontrado</span>
          <strong className="text-2xl font-semibold text-slate-900 dark:text-white">{total}</strong>
        </div>
      </div>

      <section className={`${CLIENTS_PANEL_CLASSNAME} overflow-hidden`}>
        <div className="overflow-x-auto u-scrollbar-system">
          <table className="min-w-full">
            <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Cpf/Cnpj</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {clientsQuery.isLoading ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                    Carregando clientes...
                  </td>
                </tr>
              ) : clientsQuery.isError ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-rose-600 dark:text-rose-300" colSpan={4}>
                    Não foi possível carregar a listagem no momento.
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={4}>
                    Nenhum cliente encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : (
                clients.map((client) => {
                  const uiStatus = mapClientStatusFromApi(client.status);

                  return (
                    <tr
                      key={client.id}
                      className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {client.name}
                          </p>
                          {client.company_name ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {client.company_name}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {formatCpfCnpj(client.cpf_cnpj)}
                        <DocumentIssueBadge value={client.cpf_cnpj} />
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            statusClassNameByValue[uiStatus] ?? statusClassNameByValue.Inativo
                          }`}
                        >
                          {uiStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link
                          href={`/clients/${client.id}`}
                          className="inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Informações da empresa
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={currentPage}
          limit={pageSize}
          total={total}
          count={clients.length}
          hasMore={Boolean(clientsPage?.hasMore) && currentPage < pageCount}
          isFetching={clientsQuery.isFetching}
          totalPages={pageCount}
          onFirst={() => setPage(1)}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onPageChange={setPage}
          onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
          onLast={() => setPage(pageCount)}
        />
      </section>

      <ClientGroupsPanel canEdit={integracaoAccess.canEdit} />
    </div>
  );
}
