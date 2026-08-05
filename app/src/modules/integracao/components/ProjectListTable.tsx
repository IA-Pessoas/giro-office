import Link from "next/link";
import { Edit3, Eye, RefreshCcw, Trash2 } from "lucide-react";

import type { ProjectListItem } from "../types";
import { SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME } from "../../../shared/ui/newLayout/scrollbar.ts";
import { ProjectProgressBar } from "./ProjectProgressBar";
import {
  formatProjectDate,
  getProjectStatusTone,
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
} from "./projectUi";

interface ProjectListTableProps {
  projects: ProjectListItem[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage: string;
  detailHref?: (project: ProjectListItem) => string;
  onEdit?: (project: ProjectListItem) => void;
  onDelete?: (project: ProjectListItem) => void;
  onRecalculateProgress?: (project: ProjectListItem) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  actionsDisabled?: boolean;
}

export function ProjectListTable({
  projects,
  isLoading = false,
  isError = false,
  emptyMessage,
  detailHref,
  onEdit,
  onDelete,
  onRecalculateProgress,
  canEdit = true,
  canDelete = false,
  actionsDisabled = false,
}: ProjectListTableProps) {
  return (
    <section className={`${PROJECT_PANEL_CLASSNAME} overflow-hidden`}>
      <div className={SYSTEM_HORIZONTAL_SCROLL_AREA_CLASSNAME}>
        <table className="min-w-full">
          <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-5 py-4 font-medium">Projeto</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Progresso</th>
              <th className="px-5 py-4 font-medium">Início</th>
              <th className="px-5 py-4 font-medium">Fim</th>
              <th className="px-5 py-4 font-medium text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                  Carregando projetos...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td className="px-5 py-10 text-sm text-rose-600 dark:text-rose-300" colSpan={6}>
                  Não foi possível carregar os projetos no momento.
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-slate-200/80 align-top last:border-b-0 dark:border-slate-800"
                >
                  <td className="px-5 py-4">
                    <div className="space-y-1.5">
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {project.name}
                      </p>
                      <p className="max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {project.objective || "Sem objetivo informado."}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getProjectStatusTone(
                        project.status,
                      )}`}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="min-w-32">
                      <ProjectProgressBar progress={project.porcentage} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                    {formatProjectDate(project.start_date)}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                    {formatProjectDate(project.end_date)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="mx-auto grid max-w-[230px] grid-cols-2 justify-items-stretch gap-2">
                      {detailHref ? (
                        <Link
                          href={detailHref(project)}
                          className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalhe
                        </Link>
                      ) : null}

                      {canEdit && onEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit(project)}
                          disabled={actionsDisabled}
                          className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      ) : null}

                      {canEdit && onRecalculateProgress ? (
                        <button
                          type="button"
                          onClick={() => onRecalculateProgress(project)}
                          disabled={actionsDisabled}
                          className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Recalcular
                        </button>
                      ) : null}

                      {canDelete && onDelete ? (
                        <button
                          type="button"
                          onClick={() => onDelete(project)}
                          disabled={actionsDisabled}
                          className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
