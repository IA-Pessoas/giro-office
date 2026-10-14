import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import { StatusBadge } from "@shared/components/StatusBadge";

import { useSetTiTaskCompletionMutation, useTiSpecificAccesses } from "../hooks";
import { getTiInventoryMutationErrorMessage } from "../utils/inventoryMutationError";
import {
  TiDataTable,
  TiEmptyState,
  TiInlineNotice,
  TiPanel,
  TiQueryStatePanel,
  TiSectionHeader,
} from "./tiFormControls";
import { tiSecondaryButtonClassName, tiStatusBadgeClassName } from "./tiWorkspaceUi";

/**
 * Acessos específicos que a TI concede (#1938). Do legado ("Acessos Admin") só a conclusão de
 * tarefas tem fluxo no Office; permissões gerais continuam na Administração.
 */
export function TiSpecificAccessesTab() {
  const [error, setError] = useState<string | null>(null);
  const accessesQuery = useTiSpecificAccesses();
  const mutation = useSetTiTaskCompletionMutation();

  async function toggle(userId: string, taskCompletion: boolean) {
    setError(null);
    try {
      await mutation.mutateAsync({ userId, taskCompletion });
    } catch (mutationError) {
      setError(getTiInventoryMutationErrorMessage(mutationError));
    }
  }

  return (
    <TiPanel className="space-y-5">
      <TiSectionHeader
        title="Acessos específicos"
        description="Quem pode concluir tarefas diretamente. Sem esse acesso, concluir uma tarefa gera uma solicitação de conclusão. Permissões por módulo ficam na Administração."
      />

      {error ? <TiInlineNotice tone="danger">{error}</TiInlineNotice> : null}

      <TiQueryStatePanel
        query={accessesQuery}
        emptyState={
          <TiEmptyState
            icon={ShieldCheck}
            title="Nenhum usuário ativo"
            description="Os usuários ativos da organização aparecem aqui."
          />
        }
      >
        {(rows) => (
          <TiDataTable headers={["Usuário", "Departamento", "Conclusão de tarefas", ""]}>
            {rows.map((row) => {
              const isSaving = mutation.isPending && mutation.variables?.userId === row.id;

              return (
                <tr key={row.id} className="text-slate-700 dark:text-slate-200">
                  <td className="px-4 py-3 font-semibold">{row.full_name || row.name}</td>
                  <td className="px-4 py-3">{row.department ?? "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      config={
                        row.task_completion
                          ? { label: "Permitida", variant: "success" }
                          : { label: "Vira solicitação", variant: "neutral" }
                      }
                      className={tiStatusBadgeClassName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className={tiSecondaryButtonClassName}
                        disabled={mutation.isPending}
                        onClick={() => void toggle(row.id, !row.task_completion)}
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        <span>{row.task_completion ? "Revogar" : "Conceder"}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </TiDataTable>
        )}
      </TiQueryStatePanel>
    </TiPanel>
  );
}
