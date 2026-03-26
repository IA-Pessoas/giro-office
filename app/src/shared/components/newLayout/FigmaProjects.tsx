import { useMemo, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  Filter,
  Grid3x3,
  List,
  MoreVertical,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string;
  status: "planning" | "in-progress" | "on-hold" | "completed";
  priority: "low" | "medium" | "high";
  progress: number;
  startDate: string;
  endDate: string;
  team: { name: string; avatar: string; color: string }[];
  tasks: { total: number; completed: number };
  budget?: string;
}

export function FigmaProjects() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const projects: Project[] = [
    {
      id: "1",
      name: "Projeto Delta",
      description: "Sistema de gestão de clientes e vendas",
      status: "in-progress",
      priority: "high",
      progress: 68,
      startDate: "01 Mar 2026",
      endDate: "30 Abr 2026",
      team: [
        { name: "JS", avatar: "JS", color: "bg-blue-500" },
        { name: "MS", avatar: "MS", color: "bg-green-500" },
        { name: "CO", avatar: "CO", color: "bg-purple-500" },
      ],
      tasks: { total: 24, completed: 16 },
      budget: "R$ 45.000",
    },
    {
      id: "2",
      name: "Portal Interno",
      description: "Plataforma de comunicação interna da empresa",
      status: "in-progress",
      priority: "medium",
      progress: 42,
      startDate: "15 Fev 2026",
      endDate: "15 Mai 2026",
      team: [
        { name: "AC", avatar: "AC", color: "bg-pink-500" },
        { name: "PA", avatar: "PA", color: "bg-indigo-500" },
      ],
      tasks: { total: 18, completed: 8 },
      budget: "R$ 32.000",
    },
    {
      id: "3",
      name: "App Mobile",
      description: "Aplicativo mobile para clientes finais",
      status: "planning",
      priority: "high",
      progress: 15,
      startDate: "20 Mar 2026",
      endDate: "20 Jun 2026",
      team: [
        { name: "JS", avatar: "JS", color: "bg-blue-500" },
        { name: "MS", avatar: "MS", color: "bg-green-500" },
      ],
      tasks: { total: 32, completed: 5 },
      budget: "R$ 78.000",
    },
    {
      id: "4",
      name: "Migração de Dados",
      description: "Migração do sistema legado para nova plataforma",
      status: "completed",
      priority: "low",
      progress: 100,
      startDate: "01 Jan 2026",
      endDate: "28 Fev 2026",
      team: [{ name: "CO", avatar: "CO", color: "bg-purple-500" }],
      tasks: { total: 12, completed: 12 },
      budget: "R$ 18.000",
    },
    {
      id: "5",
      name: "Dashboard Analytics",
      description: "Painel de análise de dados e métricas",
      status: "on-hold",
      priority: "medium",
      progress: 35,
      startDate: "10 Mar 2026",
      endDate: "10 Mai 2026",
      team: [
        { name: "PA", avatar: "PA", color: "bg-indigo-500" },
        { name: "AC", avatar: "AC", color: "bg-pink-500" },
      ],
      tasks: { total: 15, completed: 5 },
      budget: "R$ 28.000",
    },
    {
      id: "6",
      name: "API Integration",
      description: "Integração com APIs de terceiros",
      status: "in-progress",
      priority: "high",
      progress: 55,
      startDate: "05 Mar 2026",
      endDate: "05 Abr 2026",
      team: [
        { name: "JS", avatar: "JS", color: "bg-blue-500" },
        { name: "CO", avatar: "CO", color: "bg-purple-500" },
      ],
      tasks: { total: 20, completed: 11 },
      budget: "R$ 38.000",
    },
  ];

  const statusConfig = {
    planning: {
      label: "Planejamento",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: Clock,
    },
    "in-progress": {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: TrendingUp,
    },
    "on-hold": {
      label: "Pausado",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: AlertCircle,
    },
    completed: {
      label: "Concluído",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
  } as const;

  const priorityConfig = {
    low: { label: "Baixa", color: "text-gray-600 dark:text-slate-400" },
    medium: { label: "Média", color: "text-yellow-600 dark:text-yellow-400" },
    high: { label: "Alta", color: "text-red-600 dark:text-red-400" },
  } as const;

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === "all" || project.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [projects, searchTerm, filterStatus]);

  const stats = [
    {
      label: "Total de Projetos",
      value: projects.length,
      color: "from-blue-500 to-blue-600",
      icon: Briefcase,
    },
    {
      label: "Em Andamento",
      value: projects.filter((p) => p.status === "in-progress").length,
      color: "from-green-500 to-green-600",
      icon: TrendingUp,
    },
    {
      label: "Concluídos",
      value: projects.filter((p) => p.status === "completed").length,
      color: "from-purple-500 to-purple-600",
      icon: CheckCircle,
    },
    {
      label: "Pausados",
      value: projects.filter((p) => p.status === "on-hold").length,
      color: "from-yellow-500 to-yellow-600",
      icon: AlertCircle,
    },
  ];

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            Projetos
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Gerencie e acompanhe todos os projetos da empresa
          </p>
        </div>
        <button
          onClick={() => setShowNewProjectModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg"
          type="button"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Novo Projeto</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                </div>
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-md`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar projetos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os Status</option>
              <option value="planning">Planejamento</option>
              <option value="in-progress">Em Andamento</option>
              <option value="on-hold">Pausado</option>
              <option value="completed">Concluído</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
              type="button"
            >
              <Grid3x3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
              type="button"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const StatusIcon = statusConfig[project.status].icon;
            return (
              <div
                key={project.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </h3>
                      <Star className="w-4 h-4 text-gray-300 dark:text-gray-600 hover:text-yellow-500 hover:fill-yellow-500 transition-colors cursor-pointer" />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2 mb-2.5">
                      {project.description}
                    </p>
                  </div>
                  <div className="relative">
                    <button
                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      type="button"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[project.status].color} flex items-center gap-1`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {statusConfig[project.status].label}
                  </span>
                  <span className={`text-xs font-medium ${priorityConfig[project.priority].color}`}>
                    • {priorityConfig[project.priority].label}
                  </span>
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-slate-400">Progresso</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-3 pb-3 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-gray-900 dark:text-white font-medium">
                      {project.tasks.completed}
                    </span>
                    <span className="text-gray-400">/</span>
                    <span className="text-gray-600 dark:text-slate-400">{project.tasks.total}</span>
                    <span className="text-gray-600 dark:text-slate-400">tarefas</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      {project.team.map((member, i) => (
                        <div
                          key={`${project.id}-team-${i}`}
                          className={`w-8 h-8 rounded-full ${member.color} flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800`}
                        >
                          {member.avatar}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{project.endDate}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Projeto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Progresso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Tarefas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Equipe
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Prazo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                {filteredProjects.map((project) => {
                  const StatusIcon = statusConfig[project.status].icon;
                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{project.name}</p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-1">
                            {project.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[project.status].color} flex items-center gap-1 w-fit`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[project.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 dark:bg-slate-800 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {project.progress}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900 dark:text-white">
                          {project.tasks.completed}/{project.tasks.total}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-2">
                          {project.team.map((member, i) => (
                            <div
                              key={`${project.id}-team-${i}`}
                              className={`w-7 h-7 rounded-full ${member.color} flex items-center justify-center text-white text-xs font-semibold border-2 border-white dark:border-gray-800`}
                            >
                              {member.avatar}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400">
                          <Calendar className="w-4 h-4" />
                          <span>{project.endDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                            type="button"
                          >
                            <Eye className="w-4 h-4 text-gray-600 dark:text-slate-300" />
                          </button>
                          <button
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                            type="button"
                          >
                            <Edit className="w-4 h-4 text-gray-600 dark:text-slate-300" />
                          </button>
                          <button
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                            type="button"
                          >
                            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredProjects.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-12 text-center">
          <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Nenhum projeto encontrado
          </h3>
          <p className="text-gray-600 dark:text-slate-400 mb-6">
            {searchTerm ? "Tente ajustar sua busca ou filtros" : "Comece criando seu primeiro projeto"}
          </p>
          {!searchTerm ? (
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              type="button"
            >
              <Plus className="w-5 h-5" />
              Novo Projeto
            </button>
          ) : null}
        </div>
      ) : null}

      {showNewProjectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowNewProjectModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Novo Projeto</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Modal placeholder (Figma). Integração será feita depois.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setShowNewProjectModal(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

