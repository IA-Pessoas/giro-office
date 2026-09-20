import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "react-toastify";

import {
  useCreateRhCategoryMutation,
  useRhCategories,
  useUpdateRhCategoryMutation,
} from "../hooks/useRhRequests";
import { formatRhCategoryLabel } from "../utils/rhRequestUi";

export function RhCategoriesManager() {
  const categoriesQuery = useRhCategories({ activeOnly: false });
  const createMutation = useCreateRhCategoryMutation();
  const updateMutation = useUpdateRhCategoryMutation();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createMutation.mutateAsync({ name, active: true });
      setNewName("");
      toast.success("Categoria criada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a categoria.");
    }
  }

  async function handleUpdate(id: string, active?: boolean) {
    const name = editingId === id ? editingName.trim() : undefined;
    if (editingId === id && !name) return;
    try {
      await updateMutation.mutateAsync({ id, ...(name ? { name } : {}), ...(active !== undefined ? { active } : {}) });
      setEditingId(null);
      toast.success("Categoria atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a categoria.");
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Categorias de RH</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Categorias inativas não aparecem em novas solicitações.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleCreate();
          }}
          placeholder="Nova categoria"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
      {categoriesQuery.data?.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categoriesQuery.data.map((category) => (
            <div key={category.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
              {editingId === category.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                  {formatRhCategoryLabel(category.name)}
                </span>
              )}
              <span className={`text-xs ${category.active ? "text-emerald-600" : "text-gray-500"}`}>
                {category.active ? "Ativa" : "Inativa"}
              </span>
              {editingId === category.id ? (
                <>
                  <button type="button" aria-label="Salvar categoria" onClick={() => void handleUpdate(category.id)} className="text-emerald-600">
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Cancelar edição" onClick={() => setEditingId(null)} className="text-gray-500">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Editar categoria"
                    onClick={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                    }}
                    className="text-gray-500 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={category.active ? "Inativar categoria" : "Ativar categoria"}
                    onClick={() => void handleUpdate(category.id, !category.active)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {category.active ? "Inativar" : "Ativar"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
