import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  Briefcase,
  Building,
  Building2,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Edit,
  Eye,
  FileCheck,
  FileText,
  Key,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  PauseCircle,
  Phone,
  PieChart as PieChartIcon,
  PlayCircle,
  Plus,
  RefreshCw,
  Shield,
  User,
  UserCheck,
  XCircle,
  Ban,
} from "lucide-react";
import {
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
} from "../charts/LazyRecharts";

interface Process {
  id: string;
  clientName: string;
  cnpj: string;
  type: string;
  status: "pending" | "in-progress" | "protocoled" | "completed" | "cancelled";
  blockedBy: "client" | "directorate" | "public-agency" | "legal" | null;
  requestDate: string;
  lastUpdate: string;
  deadline?: string;
  responsible?: string;
  observations?: string;
  protocol?: string;
}

interface Permit {
  id: string;
  clientName: string;
  cnpj: string;
  type: "Funcionamento" | "Sanitário" | "Ambiental" | "Bombeiros" | "CADAN" | "Outros";
  status: "pending" | "in-progress" | "issued" | "expired" | "denied";
  blockedBy: "client" | "directorate" | "public-agency" | "legal" | null;
  entryDate: string;
  issueDate?: string;
  expiryDate?: string;
  contact?: string;
  observations?: string;
}

interface Client {
  id: string;
  cnpj: string;
  companyName: string;
  tradeName?: string;
  regime: "Simples Nacional" | "Lucro Presumido" | "Lucro Real" | "MEI";
  status: "active" | "inactive" | "suspended";
  entryDate: string;
  exitDate?: string;
  exitReason?: string;
  exitMonth?: string;
  sector: "Fiscal" | "Contábil" | "DP" | "Regularize" | "Todos";
  segment?: string;
  city?: string;
  group?: string;
  contact?: string;
  email?: string;
  phone?: string;
}

interface Password {
  id: string;
  clientName: string;
  cnpj: string;
  system:
    | "Ebis"
    | "Cefaz"
    | "Prefeitura"
    | "Regularize"
    | "Gov.br"
    | "Feira Legal"
    | "Receita Federal"
    | "Outros";
  username?: string;
  password?: string;
  status: "active" | "pending" | "expired" | "blocked";
  justification?: string;
  visibleToOthers: boolean;
  lastUpdate: string;
  responsible?: string;
}

interface Partner {
  id: string;
  name: string;
  cpf: string;
  rg?: string;
  birthDate?: string;
  entryDate: string;
  exitDate?: string;
  companies: { cnpj: string; companyName: string; share: number }[];
  status: "active" | "inactive";
  contact?: string;
  email?: string;
}

interface Reminder {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
  recurring: boolean;
  frequency?: "daily" | "weekly" | "monthly";
  assignedTo?: string;
  createdAt: string;
}

export function Regularize() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "processes" | "permits" | "clients" | "passwords" | "partners" | "reminders"
  >("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const processes: Process[] = [
    {
      id: "1",
      clientName: "Alpha Comércio Ltda",
      cnpj: "12.345.678/0001-90",
      type: "Abertura de Empresa",
      status: "in-progress",
      blockedBy: null,
      requestDate: "2026-03-10",
      lastUpdate: "2026-03-17",
      deadline: "2026-03-25",
      responsible: "João Regularize",
      observations: "Aguardando análise da Junta Comercial",
    },
    {
      id: "2",
      clientName: "Beta Indústria S/A",
      cnpj: "98.765.432/0001-10",
      type: "Alteração Contratual",
      status: "protocoled",
      blockedBy: null,
      requestDate: "2026-03-05",
      lastUpdate: "2026-03-15",
      protocol: "JC-2026-0045789",
      responsible: "Maria Regularize",
    },
    {
      id: "3",
      clientName: "Gamma Serviços ME",
      cnpj: "45.678.901/0001-23",
      type: "Licença Ambiental",
      status: "pending",
      blockedBy: "client",
      requestDate: "2026-03-16",
      lastUpdate: "2026-03-16",
      observations: "Cliente não enviou documentação completa",
    },
    {
      id: "4",
      clientName: "Delta Logística Ltda",
      cnpj: "78.901.234/0001-56",
      type: "Renovação de Alvará",
      status: "in-progress",
      blockedBy: "public-agency",
      requestDate: "2026-03-12",
      lastUpdate: "2026-03-17",
      deadline: "2026-03-30",
      responsible: "João Regularize",
      observations: "Aguardando vistoria da prefeitura",
    },
    {
      id: "5",
      clientName: "Epsilon Tech EIRELI",
      cnpj: "23.456.789/0001-89",
      type: "Baixa de Empresa",
      status: "completed",
      blockedBy: null,
      requestDate: "2026-02-15",
      lastUpdate: "2026-03-10",
      protocol: "JC-2026-0041234",
      responsible: "Maria Regularize",
    },
  ];

  const permits: Permit[] = [
    {
      id: "1",
      clientName: "Alpha Comércio Ltda",
      cnpj: "12.345.678/0001-90",
      type: "Funcionamento",
      status: "in-progress",
      blockedBy: "public-agency",
      entryDate: "2026-03-10",
      contact: "(75) 3221-4455",
      observations: "Vistoria agendada para 20/03",
    },
    {
      id: "2",
      clientName: "Beta Indústria S/A",
      cnpj: "98.765.432/0001-10",
      type: "Ambiental",
      status: "issued",
      blockedBy: null,
      entryDate: "2026-02-05",
      issueDate: "2026-03-01",
      expiryDate: "2027-03-01",
      contact: "(75) 3222-5566",
    },
    {
      id: "3",
      clientName: "Gamma Serviços ME",
      cnpj: "45.678.901/0001-23",
      type: "Sanitário",
      status: "pending",
      blockedBy: "client",
      entryDate: "2026-03-15",
      contact: "(75) 3223-6677",
      observations: "Falta envio de plantas do estabelecimento",
    },
    {
      id: "4",
      clientName: "Zeta Restaurante Ltda",
      cnpj: "34.567.890/0001-12",
      type: "Bombeiros",
      status: "expired",
      blockedBy: null,
      entryDate: "2025-03-01",
      issueDate: "2025-03-20",
      expiryDate: "2026-03-20",
      contact: "(75) 3224-7788",
    },
  ];

  const clients: Client[] = [
    {
      id: "1",
      cnpj: "12.345.678/0001-90",
      companyName: "Alpha Comércio Ltda",
      tradeName: "Alpha Store",
      regime: "Simples Nacional",
      status: "active",
      entryDate: "2025-01-15",
      sector: "Todos",
      segment: "Varejo",
      city: "Feira de Santana",
      contact: "Carlos Silva",
      email: "contato@alphastore.com",
      phone: "(75) 3221-4455",
    },
    {
      id: "2",
      cnpj: "98.765.432/0001-10",
      companyName: "Beta Indústria S/A",
      regime: "Lucro Real",
      status: "active",
      entryDate: "2024-08-20",
      sector: "Fiscal",
      segment: "Indústria",
      city: "Salvador",
      contact: "Ana Oliveira",
      email: "financeiro@betaindustria.com.br",
      phone: "(71) 3222-5566",
    },
    {
      id: "3",
      cnpj: "45.678.901/0001-23",
      companyName: "Gamma Serviços ME",
      regime: "Simples Nacional",
      status: "active",
      entryDate: "2025-06-10",
      sector: "Contábil",
      segment: "Serviços",
      city: "Feira de Santana",
      contact: "Roberto Almeida",
      email: "gamma@servicos.com",
      phone: "(75) 3223-6677",
    },
    {
      id: "4",
      cnpj: "23.456.789/0001-89",
      companyName: "Epsilon Tech EIRELI",
      regime: "Lucro Presumido",
      status: "inactive",
      entryDate: "2023-03-15",
      exitDate: "2026-03-10",
      exitReason: "Encerramento de atividades",
      exitMonth: "02/2026",
      sector: "Regularize",
      segment: "Tecnologia",
      city: "Feira de Santana",
    },
  ];

  const passwords: Password[] = [
    {
      id: "1",
      clientName: "Alpha Comércio Ltda",
      cnpj: "12.345.678/0001-90",
      system: "Gov.br",
      username: "alpha.comercio",
      password: "********",
      status: "active",
      visibleToOthers: true,
      lastUpdate: "2026-03-15",
      responsible: "João Regularize",
    },
    {
      id: "2",
      clientName: "Beta Indústria S/A",
      cnpj: "98.765.432/0001-10",
      system: "Cefaz",
      username: "beta_industria",
      status: "pending",
      visibleToOthers: true,
      justification: "Aguardando contador responsável para gerar senha",
      lastUpdate: "2026-03-16",
      responsible: "Maria Regularize",
    },
    {
      id: "3",
      clientName: "Gamma Serviços ME",
      cnpj: "45.678.901/0001-23",
      system: "Feira Legal",
      username: "gamma.servicos",
      password: "********",
      status: "active",
      visibleToOthers: true,
      lastUpdate: "2026-03-10",
    },
    {
      id: "4",
      clientName: "Delta Logística Ltda",
      cnpj: "78.901.234/0001-56",
      system: "Prefeitura",
      status: "expired",
      visibleToOthers: false,
      justification: "Senha expirada, necessário renovação",
      lastUpdate: "2026-02-28",
    },
  ];

  const partners: Partner[] = [
    {
      id: "1",
      name: "Carlos Alberto Silva",
      cpf: "123.456.789-00",
      rg: "1234567 SSP-BA",
      birthDate: "1980-05-15",
      entryDate: "2025-01-15",
      status: "active",
      companies: [{ cnpj: "12.345.678/0001-90", companyName: "Alpha Comércio Ltda", share: 70 }],
      contact: "(75) 99123-4567",
      email: "carlos@alphastore.com",
    },
    {
      id: "2",
      name: "Ana Paula Oliveira",
      cpf: "987.654.321-00",
      rg: "9876543 SSP-BA",
      birthDate: "1985-08-20",
      entryDate: "2024-08-20",
      status: "active",
      companies: [{ cnpj: "98.765.432/0001-10", companyName: "Beta Indústria S/A", share: 45 }],
      contact: "(71) 99234-5678",
      email: "ana@betaindustria.com.br",
    },
    {
      id: "3",
      name: "Roberto Almeida Santos",
      cpf: "456.789.123-00",
      status: "active",
      entryDate: "2025-06-10",
      companies: [{ cnpj: "45.678.901/0001-23", companyName: "Gamma Serviços ME", share: 100 }],
      contact: "(75) 99345-6789",
    },
  ];

  const reminders: Reminder[] = [
    {
      id: "1",
      title: "Protocolar Alteração Contratual - Beta",
      description: "Protocolar alteração contratual na Junta Comercial",
      dueDate: "2026-03-18",
      priority: "high",
      status: "pending",
      recurring: false,
      assignedTo: "Maria Regularize",
      createdAt: "2026-03-15",
    },
    {
      id: "2",
      title: "Renovar Alvará - Delta Logística",
      description: "Acompanhar renovação de alvará de funcionamento",
      dueDate: "2026-03-20",
      priority: "medium",
      status: "pending",
      recurring: false,
      assignedTo: "João Regularize",
      createdAt: "2026-03-12",
    },
    {
      id: "3",
      title: "Relatório Mensal Regularize",
      description: "Gerar relatório mensal de processos e alvarás",
      dueDate: "2026-03-31",
      priority: "medium",
      status: "pending",
      recurring: true,
      frequency: "monthly",
      assignedTo: "João Regularize",
      createdAt: "2026-03-01",
    },
  ];

  const statusConfig = {
    pending: {
      label: "Pendente",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: Clock,
    },
    "in-progress": {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: PlayCircle,
    },
    protocoled: {
      label: "Protocolado",
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      icon: FileCheck,
    },
    completed: {
      label: "Concluído",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    cancelled: {
      label: "Cancelado",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
    issued: {
      label: "Emitido",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    expired: {
      label: "Vencido",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: AlertTriangle,
    },
    denied: {
      label: "Negado",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: Ban,
    },
    active: {
      label: "Ativo",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    inactive: {
      label: "Inativo",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: PauseCircle,
    },
    suspended: {
      label: "Suspenso",
      color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
      icon: AlertCircle,
    },
    blocked: {
      label: "Bloqueada",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: Ban,
    },
  } as const;

  const blockedByConfig = {
    client: {
      label: "Cliente",
      color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
      icon: User,
    },
    directorate: {
      label: "Diretoria",
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      icon: Shield,
    },
    "public-agency": {
      label: "Órgão Público",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: Building,
    },
    legal: {
      label: "Jurídico",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: Briefcase,
    },
  } as const;

  const priorityConfig = {
    low: { label: "Baixa", color: "text-gray-600 dark:text-slate-400" },
    medium: { label: "Média", color: "text-yellow-600 dark:text-yellow-400" },
    high: { label: "Alta", color: "text-orange-600 dark:text-orange-400" },
  } as const;

  const totalProcesses = processes.length;
  const pendingProcesses = processes.filter((p) => p.status === "pending").length;
  const inProgressProcesses = processes.filter((p) => p.status === "in-progress").length;
  const completedProcesses = processes.filter((p) => p.status === "completed").length;
  const blockedProcesses = processes.filter((p) => p.blockedBy !== null).length;

  const totalPermits = permits.length;
  const issuedPermits = permits.filter((p) => p.status === "issued").length;
  const expiredPermits = permits.filter((p) => p.status === "expired").length;

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === "active").length;

  const pendingPasswords = passwords.filter((p) => p.status === "pending").length;
  const expiredPasswords = passwords.filter((p) => p.status === "expired").length;
  const pendingReminders = reminders.filter((r) => r.status === "pending").length;

  const processStatus = [
    { name: "Pendente", value: pendingProcesses, color: "#f59e0b" },
    { name: "Em Andamento", value: inProgressProcesses, color: "#3b82f6" },
    { name: "Protocolado", value: processes.filter((p) => p.status === "protocoled").length, color: "#8b5cf6" },
    { name: "Concluído", value: completedProcesses, color: "#10b981" },
  ].filter((item) => item.value > 0);

  const weeklyTrend = [
    { day: "Seg", processes: 3, permits: 2 },
    { day: "Ter", processes: 5, permits: 1 },
    { day: "Qua", processes: 2, permits: 3 },
    { day: "Qui", processes: 4, permits: 2 },
    { day: "Sex", processes: 3, permits: 4 },
    { day: "Sáb", processes: 1, permits: 1 },
    { day: "Dom", processes: 0, permits: 0 },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const filteredProcesses = useMemo(() => {
    return processes.filter((p) => {
      const matchesSearch =
        p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.cnpj.includes(searchTerm) ||
        p.type.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || p.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [processes, searchTerm, filterStatus]);

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            Departamento Regularize
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Gestão de processos, alvarás, clientes e regularizações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
            type="button"
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium">Exportar Relatório</span>
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg"
            type="button"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Processo</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-1">
        <div className="flex items-center gap-1 overflow-x-auto u-scrollbar-system">
          {(
            [
              { id: "dashboard", label: "Dashboard", icon: BarChart3 },
              { id: "processes", label: "Processos", icon: FileText, badge: blockedProcesses },
              { id: "permits", label: "Alvarás", icon: FileCheck, badge: expiredPermits },
              { id: "clients", label: "Clientes", icon: Building2, badge: activeClients },
              { id: "passwords", label: "Senhas", icon: Key, badge: pendingPasswords + expiredPasswords },
              { id: "partners", label: "Sócios", icon: UserCheck },
              { id: "reminders", label: "Lembretes", icon: Bell, badge: pendingReminders },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = "badge" in tab ? (tab.badge ?? 0) : 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                type="button"
              >
                <Icon className="w-4 h-4 inline-block mr-2" />
                {tab.label}
                {badge ? (
                  <span
                    className={`ml-2 px-2 py-0.5 text-white rounded-full text-xs ${
                      tab.id === "processes"
                        ? "bg-orange-500"
                        : tab.id === "permits"
                          ? "bg-red-500"
                          : tab.id === "clients"
                            ? "bg-green-500"
                            : tab.id === "passwords"
                              ? "bg-yellow-500"
                              : tab.id === "reminders"
                                ? "bg-blue-500"
                                : "bg-slate-500"
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Processos Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{inProgressProcesses}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{pendingProcesses} pendentes</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <FileText className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Alvarás Emitidos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{issuedPermits}</p>
                  {expiredPermits ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {expiredPermits} vencidos
                    </p>
                  ) : null}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <FileCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Clientes Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeClients}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">de {totalClients} totais</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Senhas Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingPasswords}</p>
                  {expiredPasswords ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{expiredPasswords} expiradas</p>
                  ) : null}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md">
                  <Key className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Movimentação Semanal
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Processos e Alvarás</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="day" stroke="#9ca3af" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #1f2937",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="processes" name="Processos" fill="#3b82f6" />
                  <Bar dataKey="permits" name="Alvarás" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Status dos Processos
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Distribuição atual</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={processStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {processStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {processStatus.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-700 dark:text-slate-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "processes" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Buscar processos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendente</option>
                <option value="in-progress">Em Andamento</option>
                <option value="protocoled">Protocolado</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Tipo de Processo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Travamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Responsável
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Última Atualização
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Prazo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProcesses.map((process) => {
                    const StatusIcon = statusConfig[process.status].icon;
                    return (
                      <tr
                        key={process.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-slate-900 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-slate-800 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{process.clientName}</p>
                            <p className="text-sm text-gray-600 dark:text-slate-400">{process.cnpj}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{process.type}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[process.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[process.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {process.blockedBy ? (
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium ${blockedByConfig[process.blockedBy].color} flex items-center gap-1 w-fit`}
                            >
                              {blockedByConfig[process.blockedBy].label}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {process.responsible ? (
                            <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {process.responsible}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(process.lastUpdate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {process.deadline ? (
                            <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(process.deadline)}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
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
                              className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Edit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
        </div>
      ) : null}

      {activeTab === "permits" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {permits.map((permit) => {
              const StatusIcon = statusConfig[permit.status].icon;

              return (
                <div
                  key={permit.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl border p-5 hover:shadow-lg transition-all cursor-pointer ${
                    permit.status === "expired"
                      ? "border-red-300 dark:border-red-700"
                      : "border-gray-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{permit.clientName}</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400">{permit.cnpj}</p>
                    </div>
                    <button
                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      type="button"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Tipo:</span>
                      <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-medium">
                        {permit.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Status:</span>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[permit.status].color} flex items-center gap-1`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[permit.status].label}
                      </span>
                    </div>
                    {permit.blockedBy ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Travamento:</span>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${blockedByConfig[permit.blockedBy].color}`}
                        >
                          {blockedByConfig[permit.blockedBy].label}
                        </span>
                      </div>
                    ) : null}
                    {permit.issueDate ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Emissão:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(permit.issueDate)}
                        </span>
                      </div>
                    ) : null}
                    {permit.expiryDate ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Validade:</span>
                        <span
                          className={`text-sm font-medium ${
                            permit.status === "expired"
                              ? "text-red-600 dark:text-red-400"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {formatDate(permit.expiryDate)}
                        </span>
                      </div>
                    ) : null}
                    {permit.contact ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Contato:</span>
                        <span className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {permit.contact}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {permit.observations ? (
                    <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                      <p className="text-xs text-gray-600 dark:text-slate-400 italic">{permit.observations}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "clients" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      CNPJ
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Regime
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Setor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Cidade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Entrada
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const StatusIcon = statusConfig[client.status].icon;
                    return (
                      <tr
                        key={client.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-slate-900 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-slate-800 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{client.companyName}</p>
                            {client.tradeName ? (
                              <p className="text-sm text-gray-600 dark:text-slate-400">{client.tradeName}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-mono">{client.cnpj}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                            {client.regime}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                            {client.sector}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {client.city ? (
                            <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {client.city}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[client.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[client.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(client.entryDate)}</p>
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
                              className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Edit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
        </div>
      ) : null}

      {activeTab === "passwords" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Sistema
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Usuário
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Justificativa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Atualização
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {passwords.map((pwd) => {
                    const StatusIcon = statusConfig[pwd.status].icon;
                    return (
                      <tr
                        key={pwd.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-slate-900 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-slate-800 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{pwd.clientName}</p>
                            <p className="text-sm text-gray-600 dark:text-slate-400">{pwd.cnpj}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                            {pwd.system}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {pwd.username ? (
                            <p className="text-sm text-gray-900 dark:text-white font-mono">{pwd.username}</p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[pwd.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[pwd.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {pwd.justification ? (
                            <div className="max-w-xs">
                              <p className="text-sm text-gray-900 dark:text-white">{pwd.justification}</p>
                              {pwd.visibleToOthers ? (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  Visível para outros setores
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(pwd.lastUpdate)}</p>
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
                              className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Edit className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
        </div>
      ) : null}

      {activeTab === "partners" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {partners.map((partner) => {
              const StatusIcon = statusConfig[partner.status].icon;

              return (
                <div
                  key={partner.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{partner.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400">CPF: {partner.cpf}</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[partner.status].color} flex items-center gap-1`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig[partner.status].label}
                    </span>
                  </div>

                  <div className="space-y-3 mb-4">
                    {partner.rg ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">RG:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{partner.rg}</span>
                      </div>
                    ) : null}
                    {partner.birthDate ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Nascimento:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatDate(partner.birthDate)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Entrada:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDate(partner.entryDate)}
                      </span>
                    </div>
                    {partner.contact ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-slate-400">Contato:</span>
                        <span className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {partner.contact}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                    <p className="text-xs text-gray-600 dark:text-slate-400 mb-2 font-semibold">Empresas:</p>
                    <div className="space-y-2">
                      {partner.companies.map((company) => (
                        <div key={`${partner.id}-${company.cnpj}`} className="flex items-center justify-between text-sm">
                          <span className="text-gray-900 dark:text-white">{company.companyName}</span>
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-medium">
                            {company.share}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "reminders" ? (
        <div className="space-y-5">
          <div className="space-y-4">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg ${
                      reminder.priority === "high"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        : reminder.priority === "medium"
                          ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                          : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                    } flex items-center justify-center flex-shrink-0`}
                  >
                    <Bell className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{reminder.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-slate-400">{reminder.description}</p>
                      </div>
                      <button
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        type="button"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <span className={`font-medium ${priorityConfig[reminder.priority].color}`}>
                        {priorityConfig[reminder.priority].label}
                      </span>
                      <span className="text-gray-600 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(reminder.dueDate)}
                      </span>
                      {reminder.recurring ? (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          {reminder.frequency}
                        </span>
                      ) : null}
                      {reminder.assignedTo ? (
                        <span className="text-gray-600 dark:text-slate-400 flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {reminder.assignedTo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
