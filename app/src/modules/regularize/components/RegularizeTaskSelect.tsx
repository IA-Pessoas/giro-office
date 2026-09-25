import { useEffect, useState } from "react";

import { useIntegracaoTasksList } from "@modules/integracao";

import { regularizeTextFieldClassName } from "./regularizeFormControls";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

// Tarefa da Integração vinculada a processo ou licença: busca por nome + select (#1347).
export function RegularizeTaskSelect({
  enabled,
  onChange,
  value,
}: {
  enabled: boolean;
  onChange: (taskId: string) => void;
  value: string;
}) {
  const [search, setSearch] = useState("");
  const tasksQuery = useIntegracaoTasksList({ status: "Todos", limit: 100, search }, { enabled });
  const options = (tasksQuery.data?.data ?? []).map((task) => ({
    id: task.id,
    label: `${task.name} — ${task.status}`,
  }));

  if (value && !options.some((task) => task.id === value)) {
    options.push({ id: value, label: "Tarefa vinculada (fora da lista)" });
  }

  useEffect(() => {
    if (enabled) setSearch("");
  }, [enabled]);

  const message = tasksQuery.isLoading
    ? "Carregando tarefas..."
    : tasksQuery.error
      ? `Erro ao carregar tarefas: ${tasksQuery.error.message}`
      : null;

  return (
    <fieldset className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
      <legend className="mb-2">Tarefa vinculada</legend>
      <input
        type="search"
        aria-label="Buscar tarefa"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar tarefa pelo nome"
        className={regularizeTextFieldClassName}
      />
      <RegularizeNativeSelect
        aria-label="Selecionar tarefa"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={Boolean(tasksQuery.error)}
      >
        <option value="">Nenhuma tarefa</option>
        {options.map((task) => (
          <option key={task.id} value={task.id}>
            {task.label}
          </option>
        ))}
      </RegularizeNativeSelect>
      {message ? <span className="text-xs text-gray-500 dark:text-slate-400">{message}</span> : null}
    </fieldset>
  );
}
