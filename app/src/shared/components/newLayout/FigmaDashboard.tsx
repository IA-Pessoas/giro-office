import {
  Activity,
  AlertCircle,
  ArrowUp,
  BarChart3,
  Bell,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Mail,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function FigmaDashboard() {
  const activities = [
    {
      user: "João Silva",
      action: "completou a tarefa",
      item: "Revisão de Contratos",
      time: "há 5 min",
      avatar: "JS",
      bgColor: "bg-green-100 dark:bg-green-900/30",
      textColor: "text-green-700 dark:text-green-300",
    },
    {
      user: "Maria Santos",
      action: "criou um novo",
      item: "Projeto Delta",
      time: "há 15 min",
      avatar: "MS",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      textColor: "text-blue-700 dark:text-blue-300",
    },
    {
      user: "Carlos Oliveira",
      action: "atualizou",
      item: "Documento Fiscal #1234",
      time: "há 1 hora",
      avatar: "CO",
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      textColor: "text-yellow-700 dark:text-yellow-300",
    },
    {
      user: "Ana Costa",
      action: "aprovou",
      item: "Solicitação de Férias",
      time: "há 2 horas",
      avatar: "AC",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      textColor: "text-purple-700 dark:text-purple-300",
    },
    {
      user: "Pedro Alves",
      action: "enviou",
      item: "Proposta Comercial #789",
      time: "há 3 horas",
      avatar: "PA",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      textColor: "text-indigo-700 dark:text-indigo-300",
    },
  ];

  const tasks = [
    {
      title: "Finalizar Relatório Mensal",
      priority: "Alta",
      dueDate: "Hoje, 18:00",
      status: "pending",
    },
    {
      title: "Revisar Contratos Q1 2026",
      priority: "Média",
      dueDate: "Amanhã",
      status: "pending",
    },
    {
      title: "Aprovar Folha de Pagamento",
      priority: "Alta",
      dueDate: "Hoje, 15:00",
      status: "urgent",
    },
    {
      title: "Reunião com Cliente Delta",
      priority: "Média",
      dueDate: "19 Mar",
      status: "pending",
    },
    {
      title: "Atualizar Documentação Fiscal",
      priority: "Baixa",
      dueDate: "20 Mar",
      status: "pending",
    },
  ];

  const revenueData = [
    { month: "Jan", revenue: 85, expenses: 62 },
    { month: "Fev", revenue: 92, expenses: 68 },
    { month: "Mar", revenue: 78, expenses: 58 },
    { month: "Abr", revenue: 98, expenses: 72 },
    { month: "Mai", revenue: 105, expenses: 75 },
    { month: "Jun", revenue: 118, expenses: 82 },
    { month: "Jul", revenue: 125, expenses: 88 },
  ];

  const projectsData = [
    { name: "Concluídos", value: 42, color: "#10b981" },
    { name: "Em Andamento", value: 28, color: "#3b82f6" },
    { name: "Atrasados", value: 8, color: "#ef4444" },
    { name: "Aguardando", value: 12, color: "#f59e0b" },
  ];

  const performanceData = [
    { week: "Sem 1", tasks: 24, completed: 22 },
    { week: "Sem 2", tasks: 28, completed: 26 },
    { week: "Sem 3", tasks: 32, completed: 28 },
    { week: "Sem 4", tasks: 26, completed: 24 },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Visão geral do seu workspace</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600 dark:text-gray-400">Última atualização</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Terça, 17 Mar 2026 - 14:32
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <CheckSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">24</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Tarefas Hoje</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                12%
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Concluídas: 16</span>
              <span>66%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                style={{ width: "66%" }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">R$ 125k</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Receita Março</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                8.5%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">Meta: R$ 150k</p>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full"
                style={{ width: "83%" }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md relative">
                <Bell className="w-6 h-6 text-white" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                  3
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">8</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Notificações</p>
              </div>
            </div>
            <AlertCircle className="w-5 h-5 text-purple-500 dark:text-purple-400" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">3 urgentes</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-gray-700 dark:text-gray-300">5 pendentes</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">42</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Projetos Ativos</p>
              </div>
            </div>
            <Calendar className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">Taxa de conclusão:</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">87.5%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Receitas vs Despesas
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Últimos 7 meses</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stackId="1"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stackId="2"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Status dos Projetos
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Distribuição atual</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={projectsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {projectsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {projectsData.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              Performance Semanal
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Tarefas Pendentes
            </h3>
            <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Ver todas
            </button>
          </div>
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
              >
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 border-2 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          task.priority === "Alta"
                            ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            : task.priority === "Média"
                              ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.dueDate}
                      </span>
                    </div>
                  </div>
                </div>
                {task.status === "urgent" ? (
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Atividade Recente
            </h3>
            <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
              Ver todas
            </button>
          </div>
          <div className="space-y-4">
            {activities.map((activity, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer"
              >
                <div
                  className={`w-8 h-8 rounded-full ${activity.bgColor} flex items-center justify-center flex-shrink-0`}
                >
                  <span className={`text-xs font-semibold ${activity.textColor}`}>
                    {activity.avatar}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">{activity.user}</span> {activity.action}{" "}
                    <span className="font-medium">{activity.item}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-blue-200 dark:hover:border-blue-700">
              <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Nova Tarefa</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-green-200 dark:hover:border-green-700">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Cliente</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-purple-200 dark:hover:border-purple-700">
              <Briefcase className="w-6 h-6 text-purple-600 dark:text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Projeto</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-cyan-200 dark:hover:border-cyan-700">
              <Mail className="w-6 h-6 text-cyan-600 dark:text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Enviar Email</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-orange-200 dark:hover:border-orange-700">
              <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Novo Documento</span>
            </button>

            <button className="flex flex-col items-center justify-center p-4 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-all hover:scale-105 group border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700">
              <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Agendar Reunião</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

