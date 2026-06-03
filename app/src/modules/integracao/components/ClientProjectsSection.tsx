import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";

import { useMe } from "@shared/hooks";

import {
  useDeleteProjectMutation,
  useProjectsList,
  useRecalculateProjectProgressMutation,
} from "../hooks/useProjects";
import type { ProjectListItem } from "../types";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectListTable } from "./ProjectListTable";
import { PROJECT_PRIMARY_BUTTON_CLASSNAME } from "./projectUi";

interface ClientProjectsSectionProps {
  clientId: string;
  title?: string;
  description?: string;
  showCreateButton?: boolean;
}

export function ClientProjectsSection({
  clientId,
  title = "Projetos",
  description = "Projetos vinculados a este cliente.",
  showCreateButton = true,
}: ClientProjectsSectionProps) {
  const meQuery = useMe();
  const projectsQuery = useProjectsList({ ref: "client", id: clientId });
  const deleteProjectMutation = useDeleteProjectMutation();
  const recalculateProgressMutation = useRecalculateProjectProgressMutation();
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  async function handleDelete(project: ProjectListItem) {
    if (!window.confirm(`Excluir o projeto "${project.name}"?`)) {
      return;
    }

    try {
      await deleteProjectMutation.mutateAsync({
        projectId: project.id,
        clientId,
      });
      toast.success("Projeto excluído com sucesso.");
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

  async function handleRecalculate(project: ProjectListItem) {
    try {
      await recalculateProgressMutation.mutateAsync({
        projectId: project.id,
        clientId,
      });
      toast.success("Progresso recalculado com sucesso.");
    } catch {
      toast.error("Não foi possível recalcular o progresso.");
    }
  }

  return (
    <div className="space-y-4">
      <ProjectFormModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        clientId={clientId}
      />

      <ProjectFormModal
        open={Boolean(editingProjectId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProjectId(null);
          }
        }}
        clientId={clientId}
        projectId={editingProjectId}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>

        {showCreateButton ? (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className={PROJECT_PRIMARY_BUTTON_CLASSNAME}
          >
            <Plus className="h-4 w-4" />
            Novo projeto
          </button>
        ) : null}
      </div>

      <ProjectListTable
        projects={projectsQuery.data ?? []}
        isLoading={projectsQuery.isLoading}
        isError={projectsQuery.isError}
        emptyMessage="Nenhum projeto encontrado para este cliente."
        detailHref={(project) => `/projects/${project.id}?clientId=${clientId}`}
        onEdit={(project) => setEditingProjectId(project.id)}
        onDelete={handleDelete}
        onRecalculateProgress={handleRecalculate}
        canDelete={meQuery.data?.permission === 2}
        actionsDisabled={deleteProjectMutation.isPending || recalculateProgressMutation.isPending}
      />
    </div>
  );
}
