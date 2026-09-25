import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Edit3, FolderSync, ListTodo, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { toast } from "@shared/services/toast";

import { useModuleAccess } from "@modules/auth";
import { ConfirmationDialog } from "@shared/components";
import { Dialog } from "@shared/components/ui/Dialog";

import {
  useDeleteProjectMutation,
  useProjectDetail,
  useRecalculateProjectProgressMutation,
} from "../hooks/useProjects";
import { useHireProjectPlanMutation, useProjectPlans } from "../hooks/useProjectPlans";
import { getProjectDeleteErrorMessage } from "../services/projectService.contract";
import { getProjectPlanHireErrorMessage } from "../services/projectPlanService.contract";
import type { ProjectDetail } from "../types";
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
import { getProjectTaskCardLabels } from "./taskWorkspaceUi";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { access: integracaoAccess } = useModuleAccess("integracao");
  const canEdit = integracaoAccess.canEdit;
  const projectQuery = useProjectDetail(projectId);
  const deleteProjectMutation = useDeleteProjectMutation();
  const recalculateProgressMutation = useRecalculateProjectProgressMutation();
  const hirePlanMutation = useHireProjectPlanMutation();
  const plansQuery = useProjectPlans();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [pendingProjectDeletion, setPendingProjectDeletion] = useState<ProjectDetail | null>(null);
  const [projectDeletionError, setProjectDeletionError] = useState<string | null>(null);
  const [isHirePlanDialogOpen, setIsHirePlanDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const backClientId = typeof router.query.clientId === "string" ? router.query.clientId : null;
  const project = projectQuery.data;

  function handleDelete() {
    if (!project) {
      return;
    }

    setProjectDeletionError(null);
    setPendingProjectDeletion(project);
  }

  async function handleConfirmProjectDeletion() {
    const project = pendingProjectDeletion;

    if (!project) {
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
      const message = getProjectDeleteErrorMessage(error);
      toast.error(message);
      setProjectDeletionError(message);
      throw error;
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

  async function handleHirePlan() {
    if (!selectedPlanId || !project) {
      return;
    }

    try {
      const result = await hirePlanMutation.mutateAsync({
        plan_id: selectedPlanId,
        project_id: project.id,
      });
      toast.success(result.idempotent ? "Este plano já foi contratado neste projeto." : "Plano contratado com sucesso.");
      setIsHirePlanDialogOpen(false);
      setSelectedPlanId("");
      await projectQuery.refetch();
    } catch (error) {
      toast.error(getProjectPlanHireErrorMessage(error));
    }
  }

  if (projectQuery.isLoading) {
    return (
      <section
        className={`${PROJECT_PANEL_CLASSNAME} p-6 text-sm text-slate-500 dark:text-slate-400`}
      >
        Carregando projeto...
      </section>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <section
        className={`${PROJECT_PANEL_CLASSNAME} p-6 text-sm text-rose-600 dark:text-rose-300`}
      >
        Não foi possível carregar o detalhe do projeto.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmationDialog
        open={Boolean(pendingProjectDeletion)}
        onOpenChange={(open) => {
          if (!open && !deleteProjectMutation.isPending) {
            setPendingProjectDeletion(null);
            setProjectDeletionError(null);
          }
        }}
        title={`Excluir projeto "${pendingProjectDeletion?.name ?? ""}"?`}
        description="Esta ação remove o projeto e não pode ser desfeita."
        onConfirm={handleConfirmProjectDeletion}
        isConfirming={deleteProjectMutation.isPending}
        errorMessage={projectDeletionError}
        confirmLabel="Excluir projeto"
        cancelLabel="Cancelar"
        variant="destructive"
      />

      <Dialog
        open={isHirePlanDialogOpen}
        onOpenChange={(open) => {
          if (!open && !hirePlanMutation.isPending) {
            setIsHirePlanDialogOpen(false);
            setSelectedPlanId("");
          }
        }}
        title="Contratar plano de trabalho"
        description="As tarefas serão criadas na ordem configurada no plano."
        contentClassName="w-[min(92vw,460px)]"
        footer={
          <>
            <button type="button" onClick={() => setIsHirePlanDialogOpen(false)} className={PROJECT_COMPACT_BUTTON_CLASSNAME} disabled={hirePlanMutation.isPending}>Cancelar</button>
            <button type="button" onClick={() => void handleHirePlan()} className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME} disabled={!selectedPlanId || hirePlanMutation.isPending}>{hirePlanMutation.isPending ? "Contratando..." : "Contratar"}</button>
          </>
        }
      >
        <label className="block space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Plano
          <select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" disabled={hirePlanMutation.isPending || plansQuery.isLoading}>
            <option value="">Selecione um plano</option>
            {plansQuery.data?.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select>
        </label>
      </Dialog>

      {canEdit ? (
        <ProjectFormModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          clientId={project.client_id}
          projectId={project.id}
        />
      ) : null}

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
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Tarefas vinculadas
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Leitura apenas nesta primeira versão.
              </p>
            </div>
          </div>

          {project.tasks && project.tasks.length > 0 ? (
            <div className="grid gap-3">
              {project.tasks.map((task) => {
                const labels = getProjectTaskCardLabels(task);
                return (
                  <article
                    key={task.id}
                    className={`${PROJECT_SUBPANEL_CLASSNAME} flex flex-col gap-2 p-4`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-white">{labels.title}</p>
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
                    {labels.modelName ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Modelo: {labels.modelName}
                      </p>
                    ) : null}
                    {task.department?.name || task.model?.department?.name ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Departamento: {task.department?.name || task.model?.department?.name}
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                      {task.observations || task.observation || "Sem observações específicas."}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              className={`${PROJECT_SUBPANEL_CLASSNAME} p-5 text-sm text-slate-500 dark:text-slate-400`}
            >
              Nenhuma tarefa retornada para este projeto.
            </div>
          )}
        </section>

        <aside className={`${PROJECT_PANEL_CLASSNAME} p-6`}>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Progresso e ações
          </h2>
          <div className="mt-5 space-y-4">
            <ProjectProgressBar progress={project.porcentage} />

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleRecalculate()}
                    className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME}
                    disabled={recalculateProgressMutation.isPending}
                  >
                    <FolderSync className="h-3.5 w-3.5" />
                    {recalculateProgressMutation.isPending ? "Recalculando..." : "Recalcular"}
                  </button>

                  {integracaoAccess.isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setIsHirePlanDialogOpen(true)}
                      className={PROJECT_COMPACT_PRIMARY_BUTTON_CLASSNAME}
                      disabled={plansQuery.isLoading || !plansQuery.data?.length}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Contratar plano
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(true)}
                    className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </>
              ) : null}

              {integracaoAccess.isAdmin ? (
                <button
                  type="button"
                  onClick={handleDelete}
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
