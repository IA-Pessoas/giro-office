import { useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  CheckSquare,
  Circle,
  Clock,
  Filter,
  Flag,
  MoreVertical,
  Plus,
  Search,
  Tag,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in-progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee: { name: string; avatar: string; color: string };
  dueDate: string;
  project: string;
  tags: string[];
  completed: boolean;
}

export function FigmaTasks() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("list");
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "1",
      title: "Finalizar Relatório Mensal",
      description: "Compilar todos os dados de março e gerar relatório executivo",
      status: "in-progress",
      priority: "high",
      assignee: { name: "João Silva", avatar: "JS", color: "bg-blue-500" },
      dueDate: "2026-03-17",
      project: "Projeto Delta",
      tags: ["relatório", "urgente"],
      completed: false,
    },
    {
      id: "2",
      title: "Revisar Contratos Q1 2026",
      description: "Análise e aprovação de contratos do primeiro trimestre",
      status: "todo",
      priority: "medium",
      assignee: { name: "Maria Santos", avatar: "MS", color: "bg-green-500" },
      dueDate: "2026-03-18",
      project: "Portal Interno",
      tags: ["legal", "contratos"],
      completed: false,
    },
    {
      id: "3",
      title: "Aprovar Folha de Pagamento",
      description: "Validação dos cálculos e aprovação da folha de março",
      status: "review",
      priority: "urgent",
      assignee: { name: "Carlos Oliveira", avatar: "CO", color: "bg-purple-500" },
      dueDate: "2026-03-17",
      project: "RH",
      tags: ["pagamento", "urgente"],
      completed: false,
    },
    {
      id: "4",
      title: "Reunião com Cliente Delta",
      description: "Apresentação do protótipo e alinhamento de expectativas",
      status: "todo",
      priority: "medium",
      assignee: { name: "Ana Costa", avatar: "AC", color: "bg-pink-500" },
      dueDate: "2026-03-19",
      project: "Projeto Delta",
      tags: ["reunião", "cliente"],
      completed: false,
    },
    {
      id: "5",
      title: "Atualizar Documentação Fiscal",
      description: "Revisar e atualizar documentação de obrigações fiscais",
      status: "todo",
      priority: "low",
      assignee: { name: "Pedro Alves", avatar: "PA", color: "bg-indigo-500" },
      dueDate: "2026-03-20",
      project: "Fiscal",
      tags: ["documentação", "fiscal"],
      completed: false,
    },
    {
      id: "6",
      title: "Implementar API de Pagamentos",
      description: "Integração com gateway de pagamento",
      status: "in-progress",
      priority: "high",
      assignee: { name: "João Silva", avatar: "JS", color: "bg-blue-500" },
      dueDate: "2026-03-22",
      project: "App Mobile",
      tags: ["desenvolvimento", "api"],
      completed: false,
    },
    {
      id: "7",
      title: "Testar Módulo de Relatórios",
      description: "Testes de integração e validação de dados",
      status: "review",
      priority: "medium",
      assignee: { name: "Maria Santos", avatar: "MS", color: "bg-green-500" },
      dueDate: "2026-03-18",
      project: "Dashboard Analytics",
      tags: ["testes", "qa"],
      completed: false,
    },
    {
      id: "8",
      title: "Design da Landing Page",
      description: "Criar mockups e protótipo da nova landing",
      status: "done",
      priority: "low",
      assignee: { name: "Ana Costa", avatar: "AC", color: "bg-pink-500" },
      dueDate: "2026-03-15",
      project: "Portal Interno",
      tags: ["design", "ui"],
      completed: true,
    },
  ]);

  const statusConfig = {
    todo: {
      label: "A Fazer",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: Circle,
    },
    "in-progress": {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: Clock,
    },
    review: {
      label: "Em Revisão",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: AlertCircle,
    },
    done: {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
  } as const;

  const priorityConfig = {
    low: {
      label: "Baixa",
      color: "text-gray-600 dark:text-slate-400",
      bg: "bg-gray-100 dark:bg-slate-800",
    },
    medium: {
      label: "Média",
      color: "text-yellow-600 dark:text-yellow-400",
      bg: "bg-yellow-100 dark:bg-yellow-900/30",
    },
    high: {
      label: "Alta",
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-100 dark:bg-orange-900/30",
    },
    urgent: {
      label: "Urgente",
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-100 dark:bg-red-900/30",
    },
  } as const;

  const toggleTaskComplete = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, completed: !task.completed, status: !task.completed ? "done" : "todo" }
          : task,
      ),
    );
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || task.status === filterStatus;
      const matchesPriority = filterPriority === "all" || task.priority === filterPriority;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, searchTerm, filterStatus, filterPriority]);

  const stats = [
    { label: "Total", value: tasks.length, color: "from-purple-500 to-purple-600", icon: CheckSquare },
    {
      label: "A Fazer",
      value: tasks.filter((t) => t.status === "todo").length,
      color: "from-gray-500 to-gray-600",
      icon: Circle,
    },
    {
      label: "Em Andamento",
      value: tasks.filter((t) => t.status === "in-progress").length,
      color: "from-yellow-500 to-yellow-600",
      icon: Clock,
    },
    {
      label: "Concluídas",
      value: tasks.filter((t) => t.status === "done").length,
      color: "from-green-500 to-green-600",
      icon: CheckCircle,
    },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Amanhã";
    if (diffDays === -1) return "Ontem";
    if (diffDays < 0) return `${Math.abs(diffDays)} dias atrás`;
    return `Em ${diffDays} dias`;
  };

  const isOverdue = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return date < today;
  };

  const kanbanColumns = [
    { id: "todo", label: "A Fazer", tasks: filteredTasks.filter((t) => t.status === "todo") },
    {
      id: "in-progress",
      label: "Em Andamento",
      tasks: filteredTasks.filter((t) => t.status === "in-progress"),
    },
    { id: "review", label: "Em Revisão", tasks: filteredTasks.filter((t) => t.status === "review") },
    { id: "done", label: "Concluída", tasks: filteredTasks.filter((t) => t.status === "done") },
  ];

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <CheckSquare className="w-6 h-6 text-white" />
            </div>
            Tarefas
          </h1>
          <p className="text-gray-600 dark:text-slate-400">Organize e acompanhe todas as tarefas da equipe</p>
        </div>
        <button
          onClick={() => setShowNewTaskModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-lg"
          type="button"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Nova Tarefa</span>
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
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar tarefas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">Todos os Status</option>
                <option value="todo">A Fazer</option>
                <option value="in-progress">Em Andamento</option>
                <option value="review">Em Revisão</option>
                <option value="done">Concluída</option>
              </select>
            </div>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Todas Prioridades</option>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>

            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                }`}
                type="button"
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "kanban"
                    ? "bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-300 shadow-sm"
                    : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                }`}
                type="button"
              >
                Kanban
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-3">
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const StatusIcon = statusConfig[task.status].icon;
              const overdueTask = isOverdue(task.dueDate) && !task.completed;

              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors ${
                    task.completed ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTaskComplete(task.id)}
                        className="w-5 h-5 text-purple-600 border-2 border-gray-300 dark:border-slate-700 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          <h3
                            className={`text-base font-semibold text-gray-900 dark:text-white mb-1 ${
                              task.completed ? "line-through" : ""
                            }`}
                          >
                            {task.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-1">
                            {task.description}
                          </p>
                        </div>
                        <button
                          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors flex-shrink-0"
                          type="button"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[task.status].color} flex items-center gap-1`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[task.status].label}
                        </span>

                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityConfig[task.priority].color} ${priorityConfig[task.priority].bg} flex items-center gap-1`}
                        >
                          <Flag className="w-3 h-3" />
                          {priorityConfig[task.priority].label}
                        </span>

                        <span
                          className={`flex items-center gap-1 text-xs ${
                            overdueTask
                              ? "text-red-600 dark:text-red-400 font-semibold"
                              : "text-gray-600 dark:text-slate-400"
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(task.dueDate)}
                        </span>

                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full ${task.assignee.color} flex items-center justify-center text-white text-xs font-semibold`}
                          >
                            {task.assignee.avatar}
                          </div>
                          <span className="text-xs text-gray-600 dark:text-slate-400">
                            {task.assignee.name}
                          </span>
                        </div>

                        <span className="text-xs text-gray-500 dark:text-slate-500 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {task.project}
                        </span>

                        <div className="flex items-center gap-1">
                          {task.tags.map((tag) => (
                            <span
                              key={`${task.id}-${tag}`}
                              className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kanbanColumns.map((column) => (
            <div key={column.id} className="bg-gray-50 dark:bg-slate-900/60 rounded-xl p-4 border border-gray-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  {column.label}
                  <span className="px-2 py-0.5 bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                    {column.tasks.length}
                  </span>
                </h3>
              </div>

              <div className="space-y-3">
                {column.tasks.map((task) => {
                  const overdueTask = isOverdue(task.dueDate) && !task.completed;

                  return (
                    <div
                      key={task.id}
                      className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-800 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-2 mb-3">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTaskComplete(task.id)}
                          className="mt-1 w-4 h-4 text-purple-600 border-2 border-gray-300 dark:border-slate-700 rounded focus:ring-2 focus:ring-purple-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <h4
                            className={`font-medium text-sm text-gray-900 dark:text-white mb-1 ${
                              task.completed ? "line-through" : ""
                            }`}
                          >
                            {task.title}
                          </h4>
                          <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2">
                            {task.description}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig[task.priority].color} ${priorityConfig[task.priority].bg} flex items-center gap-1 w-fit`}
                        >
                          <Flag className="w-3 h-3" />
                          {priorityConfig[task.priority].label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <div
                          className={`flex items-center gap-1 ${
                            overdueTask
                              ? "text-red-600 dark:text-red-400 font-semibold"
                              : "text-gray-600 dark:text-slate-400"
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.dueDate)}
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full ${task.assignee.color} flex items-center justify-center text-white text-xs font-semibold`}
                        >
                          {task.assignee.avatar}
                        </div>
                      </div>

                      {task.tags.length > 0 ? (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {task.tags.map((tag) => (
                            <span
                              key={`${task.id}-${tag}`}
                              className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-12 text-center">
          <CheckSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Nenhuma tarefa encontrada
          </h3>
          <p className="text-gray-600 dark:text-slate-400 mb-6">
            {searchTerm ? "Tente ajustar sua busca ou filtros" : "Comece criando sua primeira tarefa"}
          </p>
          {!searchTerm ? (
            <button
              onClick={() => setShowNewTaskModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              type="button"
            >
              <Plus className="w-5 h-5" />
              Nova Tarefa
            </button>
          ) : null}
        </div>
      ) : null}

      {showNewTaskModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewTaskModal(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Nova Tarefa</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Modal placeholder (Figma). Integração será feita depois.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setShowNewTaskModal(false)}
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

