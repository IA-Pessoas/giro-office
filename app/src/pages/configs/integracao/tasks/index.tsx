import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import {
  ArrowLeft,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { canSSRAuth, useModuleAccess } from "@modules/auth";
import {
  TaskModelModal,
  canManageTaskModelConfig,
  useTaskModels,
  type TaskModel,
} from "@modules/integracao";
import {
  TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME,
  TASK_MODEL_TABLE_CLASSNAME,
  TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME,
  TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME,
  TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME,
  getTaskModelDepartmentLabel,
  getTaskModelEmptyStateMessage,
} from "@modules/integracao/components/taskModelConfigUi";
import {
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SECONDARY_BUTTON_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
} from "@modules/integracao/components/projectUi";
import {
  TASK_TABLE_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_ACTION_CELL_CLASSNAME,
  TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME,
  TASK_TABLE_CELL_CLASSNAME,
  TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_HEAD_CELL_CLASSNAME,
} from "@modules/integracao/components/taskWorkspaceUi";
import { Dialog } from "@shared/components/ui/Dialog";
import { PaginationControls } from "@shared/components";
import { useDebouncedValue, useMe } from "@shared/hooks";
import { getLastPage } from "@shared/pagination/pagination";

const TASK_MODEL_PAGE_SIZE = 20;

export default function TaskModelsConfig() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const isSearchPending = searchTerm.trim() !== debouncedSearch;
  const {
    models,
    total,
    hasMore,
    isLoading,
    isError,
    createModel,
    updateModel,
    deleteModel,
    refresh,
  } = useTaskModels({
    search: debouncedSearch,
    page,
    limit: TASK_MODEL_PAGE_SIZE,
  });
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const meQuery = useMe();
  const canManageTaskModels = canManageTaskModelConfig(integracaoAccess);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<TaskModel | null>(null);
  const [modelToDelete, setModelToDelete] = useState<TaskModel | null>(null);

  useEffect(() => {
    if (!isLoading && models.length === 0 && total > 0 && page > 1) {
      setPage(getLastPage(total, TASK_MODEL_PAGE_SIZE));
    }
  }, [isLoading, models.length, page, total]);

  const stats = useMemo(() => {
    const departmentsCount = new Set(models.map((model) => model.department_id)).size;

    return [
      {
        label: "Modelos",
        value: total,
        description: "Templates em todo o resultado filtrado.",
      },
      {
        label: "Departamentos na página",
        value: departmentsCount,
        description: "Áreas representadas nos registros exibidos.",
      },
      {
        label: "Exibidos",
        value: models.length,
        description: "Registros presentes nesta página.",
      },
    ];
  }, [models, total]);

  function handleOpenCreate() {
    if (!canManageTaskModels) {
      return;
    }

    setSelectedModel(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(model: TaskModel) {
    if (!canManageTaskModels) {
      return;
    }

    setSelectedModel(model);
    setIsModalOpen(true);
  }

  async function handleSave(data: Parameters<typeof createModel>[0] & { id?: string }) {
    if (!canManageTaskModels) {
      return false;
    }

    if (selectedModel) {
      return updateModel({ ...data, id: selectedModel.id });
    }

    return createModel(data);
  }

  async function confirmDelete() {
    if (!modelToDelete || !canManageTaskModels) {
      return;
    }

    const success = await deleteModel(modelToDelete.id);
    if (success) {
      setModelToDelete(null);
    }
  }

  const hasSearch = Boolean(searchTerm.trim());
  const showLoading = isLoading || isSearchPending;
  const showEmptyState = !showLoading && models.length === 0;

  return (
    <>
      <Head>
        <title>Modelos de tarefas - Integração</title>
      </Head>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para tarefas
            </Link>
            <div>
              <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20">
                  <Settings2 className="h-6 w-6 text-white" />
                </div>
                Modelos de tarefas
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Configure os templates usados pela criação de tarefas da integração.
              </p>
            </div>
          </div>

          {canManageTaskModels ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
            >
              <Plus className="h-4 w-4" />
              Novo modelo
            </button>
          ) : null}
        </div>

        {!canManageTaskModels && !meQuery.isLoading ? (
          <section className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  Acesso somente leitura
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  A criação e manutenção de modelos exige permissão administrativa.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <section key={stat.label} className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{stat.description}</p>
            </section>
          ))}
        </div>

        <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="min-w-0 flex-1 space-y-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-white">
                Buscar modelo
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  className={`${PROJECT_INPUT_CLASSNAME} pl-10`}
                  placeholder="Buscar por nome ou departamento"
                />
              </div>
            </label>

            <button
              type="button"
              onClick={() => void refresh()}
              className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )}
              Atualizar
            </button>
          </div>
        </section>

        <section className={`${PROJECT_PANEL_CLASSNAME} overflow-hidden`}>
          <div className="overflow-x-auto u-scrollbar-system">
            <table className={TASK_MODEL_TABLE_CLASSNAME}>
              <colgroup>
                <col className={TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME} />
                <col className={TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME} />
                <col className={TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME} />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
                <tr className={TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME}>
                  <th className={`${TASK_TABLE_HEAD_CELL_CLASSNAME} pl-5`}>Modelo</th>
                  <th className={TASK_TABLE_HEAD_CELL_CLASSNAME}>Departamento</th>
                  <th className={TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {showLoading ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400"
                    >
                      <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                      Carregando modelos...
                    </td>
                  </tr>
                ) : showEmptyState ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400"
                    >
                      {getTaskModelEmptyStateMessage({ hasSearch, isError })}
                    </td>
                  </tr>
                ) : (
                  models.map((model) => (
                    <tr
                      key={model.id}
                      className="border-b border-slate-200/80 last:border-b-0 dark:border-slate-800"
                    >
                      <td className={`${TASK_TABLE_CELL_CLASSNAME} pl-5`}>
                        <p
                          className="font-semibold text-slate-900 dark:text-white"
                          title={model.name}
                        >
                          {model.name}
                        </p>
                      </td>
                      <td className={TASK_TABLE_CELL_CLASSNAME}>
                        {getTaskModelDepartmentLabel(model)}
                      </td>
                      <td className={TASK_TABLE_ACTION_CELL_CLASSNAME}>
                        {canManageTaskModels ? (
                          <div className="flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(model)}
                              className={TASK_TABLE_ACTION_BUTTON_CLASSNAME}
                              aria-label={`Editar modelo ${model.name}`}
                              title="Editar modelo"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setModelToDelete(model)}
                              className={TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME}
                              aria-label={`Excluir modelo ${model.name}`}
                              title="Excluir modelo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Somente leitura
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            limit={TASK_MODEL_PAGE_SIZE}
            total={total}
            count={models.length}
            hasMore={hasMore}
            isFetching={isLoading || isSearchPending}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </section>
      </div>

      <TaskModelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={selectedModel}
        onSave={handleSave}
      />

      <Dialog
        open={Boolean(modelToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setModelToDelete(null);
          }
        }}
        title="Excluir modelo"
        description="Confirmação de exclusão de modelo de tarefa"
        contentClassName="w-[min(92vw,460px)]"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModelToDelete(null)}
              className={PROJECT_SECONDARY_BUTTON_CLASSNAME}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
            >
              Excluir
            </button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          Tem certeza que deseja excluir o modelo{" "}
          <span className="font-semibold text-slate-900 dark:text-white">
            {modelToDelete?.name}
          </span>
          ? Essa ação não pode ser desfeita.
        </p>
      </Dialog>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
