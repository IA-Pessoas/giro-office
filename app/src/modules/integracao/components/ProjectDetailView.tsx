import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Edit3, FolderSync, ListTodo, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { useModuleAccess } from "@modules/auth";

import {
  useDeleteProjectMutation,
  useProjectDetail,
  useRecalculateProjectProgressMutation,
} from "../hooks/useProjects";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectProgressBar } from "./ProjectProgressBar";
import {
  formatProjectDate,
  getProjectStatusTone,
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
} from "./projectUi";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const projectQuery = useProjectDetail(projectId);
  const deleteProjectMutation = useDeleteProjectMutation();
  const recalculateProgressMutation = useRecalculateProjectProgressMutation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const backClientId = typeof router.query.clientId === "string" ? router.query.clientId : null;
  const project = projectQuery.data;

  async function handleDelete() {
    if (!project) {
      return;
    }

    if (!window.confirm(`Excluir o projeto "${project.name}"?`)) {
      return;
    }

    try {
      await deleteProjectMutation.mutateAsync({
        projectId: project.id,
        clientId: project.client_id,
      });
      toast.success("Projeto excluído com sucesso.");
      await router.push(backClientId ? `/projects?clientId=${backClientId}` : "/projects");
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { status?: number } }).response?.status === "number"
          ? (error as { response?: { status?: number } }).response?.status
          : null;

      if (statusCode === 403) {
        toast.error("Somente usuários com permissão 2 podem excluir projetos.");
        return;
      }

      toast.error("Não foi possível excluir o projeto.");
    }
  }

  async function handleRecalculate() {
    if (!project) {
      return;
    }

    try {
      await recalculateProgressMutation.mutateAsync({
        projectId: project.id,
        clientId: project.client_id,
      });
      toast.success("Progresso recalculado com sucesso.");
      await projectQuery.refetch();
    } catch {
      toast.error("Não foi possível recalcular o progresso.");
    }
  }

  if (projectQuery.isLoading) {
    return (
      <section className={`${PROJECT_PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}>
        Carregando projeto...
      </section>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <section className={`${PROJECT_PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}>
        Não foi possível carregar o detalhe do projeto.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectFormModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        clientId={project.client_id}
        projectId={project.id}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={backClientId ? `/projects?clientId=${backClientId}` : "/projects"}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para projetos
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{project.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Cliente: {project.client?.name ?? "Cliente não informado"}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${getProjectStatusTone(
            project.status,
          )}`}
        >
          {project.status}
        </span>
      </div>

      <section className={`${PROJECT_PANEL_CLASSNAME} p-6`}>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Resumo do projeto</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Data de início" value={formatProjectDate(project.start_date)} />
          <SummaryCard label="Data final" value={formatProjectDate(project.end_date)} />
          <SummaryCard label="Cliente" value={project.client?.name ?? "Não informado"} />
          <SummaryCard label="Status" value={project.status} />
        </div>

        <div className={`mt-4 ${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Objetivo
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            {project.objective || "Sem objetivo informado."}
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className={`${PROJECT_PANEL_CLASSNAME} p-6`}>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tarefas vinculadas</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Leitura apenas nesta primeira versão.
              </p>
            </div>
          </div>

          {project.tasks && project.tasks.length > 0 ? (
            <div className="grid gap-3">
              {project.tasks.map((task) => (
                <article
                  key={task.id}
                  className={`${PROJECT_SUBPANEL_CLASSNAME} flex flex-col gap-2 p-4`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {task.model?.name || task.name || "Tarefa sem nome"}
                    </p>
                    {task.status ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getProjectStatusTone(
                          task.status,
                        )}`}
                      >
                        {task.status}
                      </span>
                    ) : null}
                  </div>
                  {task.department?.name || task.model?.department?.name ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Departamento: {task.department?.name || task.model?.department?.name}
                    </p>
                  ) : null}
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                    {task.observations || task.observation || "Sem observações específicas."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className={`${PROJECT_SUBPANEL_CLASSNAME} p-5 text-sm text-slate-500 dark:text-slate-400`}>
              Nenhuma tarefa retornada para este projeto.
            </div>
          )}
        </section>

        <aside className={`${PROJECT_PANEL_CLASSNAME} p-6`}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Progresso e ações</h2>
          <div className="mt-5 space-y-4">
            <ProjectProgressBar progress={project.porcentage} />

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <button
                type="button"
                onClick={() => void handleRecalculate()}
                className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME}
                disabled={recalculateProgressMutation.isPending}
              >
                <FolderSync className="h-3.5 w-3.5" />
                {recalculateProgressMutation.isPending ? "Recalculando..." : "Recalcular"}
              </button>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                className={PROJECT_COMPACT_BUTTON_CLASSNAME}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar
              </button>

              {integracaoAccess.isAdmin ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                  disabled={deleteProjectMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteProjectMutation.isPending ? "Excluindo..." : "Excluir"}
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
