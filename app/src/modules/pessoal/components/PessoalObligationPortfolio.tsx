import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { useAssignableUsers } from "@modules/rh";

import { usePessoalGroups } from "../hooks/usePessoalGroups";
import {
  usePessoalObligationPortfolio,
  useUpdatePessoalPortfolioObligationMutation,
} from "../hooks/usePessoalObligations";
import {
  PESSOAL_OBLIGATION_ITEMS,
  type PessoalObligationItem,
  type PessoalObligationItemState,
  type PessoalObligationPortfolioItem,
} from "../types/obligations";
import {
  obligationItemState,
  obligationItemValue,
  PESSOAL_OBLIGATION_STATE_LABELS,
} from "../utils/obligationPortfolio";
import { getPessoalErrorMessage } from "../utils/pessoalErrorMessage";
import {
  pessoalCompactSelectClassName,
  pessoalSecondaryButtonClassName,
  pessoalTextFieldClassName,
} from "./pessoalFormControls";

const PAGE_SIZE = 25;
const STATES = Object.keys(PESSOAL_OBLIGATION_STATE_LABELS) as PessoalObligationItemState[];

interface PessoalObligationPortfolioProps {
  competence: string;
  canEdit: boolean;
}

export function PessoalObligationPortfolio({ competence, canEdit }: PessoalObligationPortfolioProps) {
  const [responsibleId, setResponsibleId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [item, setItem] = useState<PessoalObligationItem | "">("");
  const [state, setState] = useState<PessoalObligationItemState | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [competence, responsibleId, groupId, item, state]);

  const portfolioQuery = usePessoalObligationPortfolio({
    competence,
    responsavel_id: responsibleId || undefined,
    group_id: groupId || undefined,
    item: item || undefined,
    state: state || undefined,
    page,
    page_size: PAGE_SIZE,
  });
  const usersQuery = useAssignableUsers({ module: "pessoal" });
  const groupsQuery = usePessoalGroups();
  const updateMutation = useUpdatePessoalPortfolioObligationMutation();
  const data = portfolioQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  function handleItemChange(next: PessoalObligationItem | "") {
    setItem(next);
    // Sem item, o servidor só aceita "pendente em qualquer item".
    if (!next && state && state !== "pending") setState("");
  }

  async function handleChange(
    row: PessoalObligationPortfolioItem,
    field: PessoalObligationItem,
    next: PessoalObligationItemState,
  ) {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: row.id,
        payload: { [field]: obligationItemValue(next) },
      });
    } catch (err) {
      setError(getPessoalErrorMessage(err, "Não foi possível atualizar a obrigação."));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Carteira</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Obrigações de todos os clientes na competência selecionada.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          Responsável
          <select
            value={responsibleId}
            onChange={(event) => setResponsibleId(event.target.value)}
            className={pessoalTextFieldClassName}
          >
            <option value="">Todos</option>
            {(usersQuery.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          Grupo
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className={pessoalTextFieldClassName}
          >
            <option value="">Todos</option>
            {(groupsQuery.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          Item
          <select
            value={item}
            onChange={(event) => handleItemChange(event.target.value as PessoalObligationItem | "")}
            className={pessoalTextFieldClassName}
          >
            <option value="">Todos</option>
            {PESSOAL_OBLIGATION_ITEMS.map((option) => (
              <option key={option.name} value={option.name}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          Estado
          <select
            value={state}
            onChange={(event) => setState(event.target.value as PessoalObligationItemState | "")}
            className={pessoalTextFieldClassName}
          >
            <option value="">Todos</option>
            {STATES.map((option) => (
              <option key={option} value={option} disabled={!item && option !== "pending"}>
                {PESSOAL_OBLIGATION_STATE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {portfolioQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando carteira...
        </p>
      ) : portfolioQuery.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {getPessoalErrorMessage(portfolioQuery.error, "Falha ao carregar a carteira.")}
        </p>
      ) : data && data.items.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Nenhuma obrigação encontrada para a competência e os filtros escolhidos. Se a
          competência ainda não foi gerada, use “Gerar todos”.
        </p>
      ) : data ? (
        <div className="overflow-x-auto u-scrollbar-system rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Grupo</th>
                <th className="px-3 py-2">Responsável</th>
                {PESSOAL_OBLIGATION_ITEMS.map((option) => (
                  <th key={option.name} className="px-3 py-2">
                    {option.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.items.map((row) => (
                <tr key={row.id} className="text-gray-800 dark:text-gray-200">
                  <td className="px-3 py-2 font-medium">{row.client.name}</td>
                  <td className="px-3 py-2">{row.group_snapshot_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.responsible?.name ?? "Sem responsável"}</td>
                  {PESSOAL_OBLIGATION_ITEMS.map((option) => {
                    const current = obligationItemState(row[option.name]);
                    return (
                      <td key={option.name} className="px-3 py-2">
                        {canEdit ? (
                          <select
                            aria-label={`${option.label} de ${row.client.name}`}
                            value={current}
                            disabled={updateMutation.isPending}
                            onChange={(event) =>
                              void handleChange(
                                row,
                                option.name,
                                event.target.value as PessoalObligationItemState,
                              )
                            }
                            className={pessoalCompactSelectClassName}
                          >
                            {STATES.map((value) => (
                              <option key={value} value={value}>
                                {PESSOAL_OBLIGATION_STATE_LABELS[value]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          PESSOAL_OBLIGATION_STATE_LABELS[current]
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.total > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span>
            {data.total} cliente(s) · página {data.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={page <= 1 || portfolioQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= totalPages || portfolioQuery.isFetching}
              className={pessoalSecondaryButtonClassName}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
