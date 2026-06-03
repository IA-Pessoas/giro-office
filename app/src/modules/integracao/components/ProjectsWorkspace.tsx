import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Edit3,
  Eye,
  FolderKanban,
  Plus,
  RefreshCcw,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { toast } from "react-toastify";

import { useClients } from "@modules/clients";
import { useMe } from "@shared/hooks";

import {
  useDeleteProjectMutation,
  useProjectsList,
  useRecalculateProjectProgressMutation,
} from "../hooks/useProjects";
import type { ProjectListItem } from "../types";
import { ProjectFormModal } from "./ProjectFormModal";
import { ProjectProgressBar } from "./ProjectProgressBar";
import {
  formatProjectDate,
  getProjectStatusTone,
  PROJECT_COMPACT_BUTTON_CLASSNAME,
  PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME,
  PROJECT_INPUT_CLASSNAME,
  PROJECT_PANEL_CLASSNAME,
  PROJECT_PRIMARY_BUTTON_CLASSNAME,
  PROJECT_SELECT_ARROW_STYLE,
  PROJECT_SELECT_CLASSNAME,
  PROJECT_SUBPANEL_CLASSNAME,
} from "./projectUi";

function countByStatus(projects: ProjectListItem[], matcher: (status: string) => boolean) {
  return projects.filter((project) => matcher(project.status.toLowerCase())).length;
}

const PROJECT_HIGHLIGHT_STATUS_WEIGHT = {
  paused: 1,
  completed: 2,
  default: 3,
  inProgress: 4,
} as const;

function getProjectHighlightStatusWeight(status: string) {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus.includes("andamento")) {
    return PROJECT_HIGHLIGHT_STATUS_WEIGHT.inProgress;
  }

  if (normalizedStatus.includes("concl")) {
    return PROJECT_HIGHLIGHT_STATUS_WEIGHT.completed;
  }

  if (normalizedStatus.includes("paus") || normalizedStatus.includes("paralis")) {
    return PROJECT_HIGHLIGHT_STATUS_WEIGHT.paused;
  }

  return PROJECT_HIGHLIGHT_STATUS_WEIGHT.default;
}

function getHighlightScore(project: ProjectListItem) {
  return getProjectHighlightStatusWeight(project.status) * 1000 + project.porcentage;
}

function isCompletedStatus(status: string) {
  return status.toLowerCase().includes("concl");
}

function resolveDaysUntil(date: string | null | undefined) {
  if (!date) {
    return null;
  }

  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffInMs = target.getTime() - startOfToday.getTime();
  return Math.round(diffInMs / (1000 * 60 * 60 * 24));
}

function formatDeadlineHint(daysUntil: number | null) {
  if (daysUntil === null) {
    return "Sem prazo definido";
  }

  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)} dia(s) em atraso`;
  }

  if (daysUntil === 0) {
    return "Prazo hoje";
  }

  return `${daysUntil} dia(s) restantes`;
}

export function ProjectsWorkspace() {
  const router = useRouter();
  const meQuery = useMe();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const clientsQuery = useClients({
    page: 1,
    limit: 100,
  });

  useEffect(() => {
    if (typeof router.query.clientId === "string") {
      setSelectedClientId(router.query.clientId);
    }
  }, [router.query.clientId]);

  const selectedClient =
    clientsQuery.data?.items.find((client) => client.id === selectedClientId) ?? null;

  const projectsQuery = useProjectsList(
    selectedClientId ? { ref: "client", id: selectedClientId } : null,
  );

  const deleteProjectMutation = useDeleteProjectMutation();
  const recalculateProgressMutation = useRecalculateProjectProgressMutation();
  const projects = projectsQuery.data ?? [];

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(projects.map((project) => project.status))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        !projectSearch.trim() ||
        project.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
        project.objective.toLowerCase().includes(projectSearch.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projectSearch, projects, statusFilter]);

  const highlightedProjects = useMemo(() => {
    return [...filteredProjects].sort((left, right) => getHighlightScore(right) - getHighlightScore(left));
  }, [filteredProjects]);

  const highlightedProjectsGridClassName = useMemo(() => {
    if (highlightedProjects.length <= 1) {
      return "mx-auto max-w-2xl grid-cols-1";
    }

    if (highlightedProjects.length === 2) {
      return "grid-cols-1 lg:grid-cols-2";
    }

    return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  }, [highlightedProjects.length]);

  const upcomingProject = useMemo(() => {
    return [...projects]
      .filter((project) => !isCompletedStatus(project.status) && project.end_date)
      .sort((left, right) => {
        const leftDays = resolveDaysUntil(left.end_date) ?? Number.POSITIVE_INFINITY;
        const rightDays = resolveDaysUntil(right.end_date) ?? Number.POSITIVE_INFINITY;
        return leftDays - rightDays;
      })[0] ?? null;
  }, [projects]);

  const averageProgress = useMemo(() => {
    if (projects.length === 0) {
      return 0;
    }

    const total = projects.reduce((sum, project) => sum + project.porcentage, 0);
    return Math.round(total / projects.length);
  }, [projects]);

  const pausedProjects = useMemo(
    () =>
      countByStatus(
        projects,
        (status) => status.includes("paus") || status.includes("paralis"),
      ),
    [projects],
  );

  const stats = useMemo(
    () => [
      {
        label: "Projetos",
        value: projects.length,
        icon: FolderKanban,
        description: "Volume atual da carteira carregada para este cliente.",
      },
      {
        label: "Em andamento",
        value: countByStatus(projects, (status) => status.includes("andamento")),
        icon: TrendingUp,
        description: "Projetos ativos que pedem acompanhamento mais frequente.",
      },
      {
        label: "Concluídos",
        value: countByStatus(projects, (status) => status.includes("concl")),
        icon: Target,
        description: "Projetos encerrados com sucesso na carteira visível.",
      },
    ],
    [projects],
  );

  async function handleDelete(project: ProjectListItem) {
    if (!selectedClientId) {
      return;
    }

    if (!window.confirm(`Excluir o projeto "${project.name}"?`)) {
      return;
    }

    try {
      await deleteProjectMutation.mutateAsync({
        projectId: project.id,
        clientId: selectedClientId,
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
    if (!selectedClientId) {
      return;
    }

    try {
      await recalculateProgressMutation.mutateAsync({
        projectId: project.id,
        clientId: selectedClientId,
      });
      toast.success("Progresso recalculado com sucesso.");
    } catch {
      toast.error("Não foi possível recalcular o progresso.");
    }
  }

  function handleClientChange(nextClientId: string) {
    setSelectedClientId(nextClientId || null);
    router
      .replace(
        {
          pathname: "/projects",
          query: nextClientId ? { clientId: nextClientId } : {},
        },
        undefined,
        { shallow: true },
      )
      .catch(() => undefined);
  }

  return (
    <div className="space-y-6">
      <ProjectFormModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        clientId={selectedClientId}
      />

      <ProjectFormModal
        open={Boolean(editingProjectId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProjectId(null);
          }
        }}
        clientId={selectedClientId}
        projectId={editingProjectId}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-end">
        <div className="min-w-0">
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-slate-900 dark:text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/20">
              <BriefcaseBusiness className="h-6 w-6 text-white" />
            </div>
            Projetos
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Gestão focada por cliente, com progresso real e detalhe dedicado por projeto.
          </p>
        </div>

        <div
          className={`${PROJECT_SUBPANEL_CLASSNAME} flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between`}
        >
          <label className="min-w-0 flex-1 space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">Cliente</span>
            <select
              value={selectedClientId ?? ""}
              onChange={(event) => handleClientChange(event.target.value)}
              className={PROJECT_SELECT_CLASSNAME}
              style={PROJECT_SELECT_ARROW_STYLE}
            >
              <option value="">Selecione um cliente</option>
              {(clientsQuery.data?.items ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={!selectedClientId}
            onClick={() => setIsCreateModalOpen(true)}
            className={`${PROJECT_PRIMARY_BUTTON_CLASSNAME} min-h-10 px-3.5 py-2 text-sm shadow-none`}
          >
            <Plus className="h-4 w-4" />
            Novo projeto
          </button>
        </div>
      </div>

      <section
        className={`${PROJECT_PANEL_CLASSNAME} overflow-hidden border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-[color:var(--colors-brand-gradient-end)]/85 text-white dark:border-slate-700`}
      >
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.95fr)]">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                Cockpit de projetos
              </div>
              <div>
                <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {selectedClient?.name ?? "Selecione um cliente para abrir o cockpit"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/85 sm:text-base">
                  {selectedClient
                    ? "Uma leitura rápida para decidir onde editar, recalcular progresso ou aprofundar no detalhe do projeto."
                    : "Assim que um cliente for selecionado, você verá prioridade, ritmo médio e prazo mais sensível da carteira."}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="flex min-h-[184px] flex-col rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  Ritmo médio
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">{averageProgress}%</p>
                <p className="mt-3 text-sm leading-6 text-slate-200/75">
                  Média simples do progresso dos projetos carregados para o cliente.
                </p>
              </div>

              <div className="flex min-h-[184px] flex-col rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  Pausados
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">{pausedProjects}</p>
                <p className="mt-3 text-sm leading-6 text-slate-200/75">
                  Projetos que precisam de reentrada, definição ou destravamento.
                </p>
              </div>

              <div className="flex min-h-[184px] flex-col rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm sm:col-span-2 xl:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                  Foco imediato
                </p>
                <p className="mt-3 text-base font-semibold leading-6 text-white">
                  {upcomingProject?.name ?? "Sem prazo crítico agora"}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-200/75">
                  {upcomingProject
                    ? formatDeadlineHint(resolveDaysUntil(upcomingProject.end_date))
                    : "Os prazos aparecem aqui assim que a carteira tiver datas previstas."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-h-[184px] flex-col rounded-[1.75rem] border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              <Clock3 className="h-3.5 w-3.5" />
              Próximo prazo
            </div>
            <div className="mt-5 flex flex-1 flex-col gap-4">
              <p className="text-xl font-semibold leading-8 text-white">
                {upcomingProject?.name ?? "Nenhum projeto com prazo definido"}
              </p>
              <p className="text-sm leading-6 text-slate-200/80">
                {upcomingProject
                  ? `Encerramento previsto para ${formatProjectDate(
                      upcomingProject.end_date,
                    )}, ${formatDeadlineHint(resolveDaysUntil(upcomingProject.end_date)).toLowerCase()}.`
                  : "Os prazos aparecem aqui assim que a carteira do cliente tiver datas previstas."}
              </p>
              {upcomingProject ? (
                <div className="mt-auto rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                    Status atual
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{upcomingProject.status}</span>
                    <span className="text-xs text-slate-200/75">
                      Início em {formatProjectDate(upcomingProject.start_date)}
                    </span>
                  </div>
                  <div className="mt-4">
                    <ProjectProgressBar progress={upcomingProject.porcentage} />
                  </div>
                </div>
              ) : (
                <div className="mt-auto rounded-2xl border border-dashed border-white/15 px-4 py-5 text-sm leading-6 text-slate-200/70">
                  Defina datas finais nos projetos para transformar este painel em um radar real de prazo.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <section key={stat.label} className={`${PROJECT_PANEL_CLASSNAME} p-5`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                    <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--colors-brand-gradient-start)]/15 to-[var(--colors-brand-gradient-end)]/20 text-[var(--colors-brand-gradient-end)] dark:text-[var(--colors-brand-gradient-start)]">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{stat.description}</p>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">
              Buscar projeto
            </span>
            <input
              type="text"
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              className={PROJECT_INPUT_CLASSNAME}
              placeholder="Buscar por nome ou objetivo"
            />
          </label>
        </section>

        <section className={`${PROJECT_SUBPANEL_CLASSNAME} p-4`}>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-white">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={PROJECT_SELECT_CLASSNAME}
              style={PROJECT_SELECT_ARROW_STYLE}
            >
              <option value="all">Todos</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </section>
      </div>

      {!selectedClientId ? (
        <section className={`${PROJECT_PANEL_CLASSNAME} p-10 text-center`}>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            Selecione um cliente para começar
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            A listagem de projetos é orientada por cliente nesta primeira versão.
          </p>
        </section>
      ) : highlightedProjects.length === 0 ? (
        <section className={`${PROJECT_PANEL_CLASSNAME} p-10 text-center`}>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            Nenhum projeto encontrado
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Ajuste os filtros ou crie um novo projeto para começar.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Radar rápido dos projetos
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Cartões operacionais com leitura rápida da carteira mais sensível neste momento.
              </p>
            </div>
          </div>

          <div className={`grid justify-items-center gap-4 ${highlightedProjectsGridClassName}`}>
            {highlightedProjects.map((project, index) => {
              const detailHref = `/projects/${project.id}?clientId=${selectedClientId}`;
              const accentClassName =
                index === 0
                  ? "from-[var(--colors-brand-gradient-start)]/20 via-slate-50 to-[var(--colors-brand-gradient-end)]/10 dark:from-[var(--colors-brand-gradient-start)]/15 dark:via-slate-900 dark:to-[var(--colors-brand-gradient-end)]/10"
                  : "from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950";

              return (
                <article
                  key={project.id}
                  className={`relative w-full max-w-[30rem] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 ${accentClassName}`}
                >
                  <div className="flex h-full flex-col gap-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getProjectStatusTone(
                            project.status,
                          )}`}
                        >
                          {project.status}
                        </span>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {project.name}
                          </h3>
                          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
                            {project.objective || "Sem objetivo detalhado para este projeto."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <ProjectProgressBar progress={project.porcentage} />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className={`${PROJECT_SUBPANEL_CLASSNAME} p-3`}>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Início
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                            {formatProjectDate(project.start_date)}
                          </p>
                        </div>

                        <div className={`${PROJECT_SUBPANEL_CLASSNAME} p-3`}>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Prazo
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                            {formatProjectDate(project.end_date)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto grid grid-cols-2 gap-2">
                      <Link href={detailHref} className={PROJECT_COMPACT_BUTTON_CLASSNAME}>
                        <Eye className="h-3.5 w-3.5" />
                        Detalhe
                      </Link>

                      <button
                        type="button"
                        onClick={() => setEditingProjectId(project.id)}
                        className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleRecalculate(project)}
                        disabled={recalculateProgressMutation.isPending}
                        className={PROJECT_COMPACT_BUTTON_CLASSNAME}
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Recalcular
                      </button>

                      {meQuery.data?.permission === 2 ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(project)}
                          disabled={deleteProjectMutation.isPending}
                          className={PROJECT_COMPACT_DANGER_BUTTON_CLASSNAME}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
