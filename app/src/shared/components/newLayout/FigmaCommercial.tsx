import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle,
  CheckSquare,
  Clock,
  DollarSign,
  Download,
  Edit,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Mail,
  MessageSquare,
  MoreVertical,
  PauseCircle,
  Phone,
  PieChart as PieChartIcon,
  Plus,
  Search,
  Send,
  Target,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
  XCircle,
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
} from "recharts";

interface Lead {
  id: string;
  name: string;
  company: string;
  cnpj: string;
  email: string;
  phone: string;
  source: "Website" | "Indicação" | "WhatsApp" | "Onvio" | "Cold Call";
  status:
    | "new"
    | "contacted"
    | "qualified"
    | "proposal"
    | "negotiation"
    | "won"
    | "lost"
    | "paused";
  value: number;
  priority: "low" | "medium" | "high" | "urgent";
  assignee: string;
  createdDate: string;
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
}

interface Proposal {
  id: string;
  lead: string;
  company: string;
  services: string[];
  monthlyValue: number;
  setupFee: number;
  validUntil: string;
  status: "draft" | "sent" | "viewed" | "approved" | "rejected";
  sentDate?: string;
  viewedDate?: string;
}

interface Contract {
  id: string;
  company: string;
  cnpj: string;
  type: "Contábil" | "Fiscal" | "Pessoal" | "Completo";
  monthlyValue: number;
  startDate: string;
  endDate?: string;
  status: "active" | "suspended" | "cancelled";
  paymentDay: number;
}

export function FigmaCommercial() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "leads" | "pipeline" | "proposals" | "contracts"
  >("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [pipelineView, setPipelineView] = useState<"kanban" | "table">("kanban");

  const leads: Lead[] = [
    {
      id: "1",
      name: "João Silva",
      company: "Tech Solutions Ltda",
      cnpj: "12.345.678/0001-90",
      email: "joao@techsolutions.com",
      phone: "(11) 98765-4321",
      source: "Website",
      status: "negotiation",
      value: 4500,
      priority: "high",
      assignee: "Maria Santos",
      createdDate: "2026-03-10",
      lastContact: "2026-03-16",
      nextFollowUp: "2026-03-18",
      notes: "Interessado em serviços contábeis completos",
    },
    {
      id: "2",
      name: "Ana Costa",
      company: "Comércio Beta ME",
      cnpj: "98.765.432/0001-11",
      email: "ana@comerciobeta.com",
      phone: "(11) 91234-5678",
      source: "Indicação",
      status: "proposal",
      value: 2800,
      priority: "high",
      assignee: "Carlos Oliveira",
      createdDate: "2026-03-12",
      lastContact: "2026-03-15",
      nextFollowUp: "2026-03-19",
      notes: "Precisa migrar do escritório anterior",
    },
    {
      id: "3",
      name: "Pedro Santos",
      company: "Serviços Gamma Ltda",
      cnpj: "11.222.333/0001-44",
      email: "pedro@gamma.com",
      phone: "(11) 99876-5432",
      source: "WhatsApp",
      status: "qualified",
      value: 3200,
      priority: "medium",
      assignee: "Maria Santos",
      createdDate: "2026-03-13",
      lastContact: "2026-03-14",
      nextFollowUp: "2026-03-20",
    },
    {
      id: "4",
      name: "Carla Mendes",
      company: "Consultoria Delta S/A",
      cnpj: "55.666.777/0001-88",
      email: "carla@delta.com",
      phone: "(11) 97654-3210",
      source: "Onvio",
      status: "contacted",
      value: 5500,
      priority: "urgent",
      assignee: "Carlos Oliveira",
      createdDate: "2026-03-14",
      lastContact: "2026-03-15",
      nextFollowUp: "2026-03-17",
      notes: "Empresa de médio porte, precisa de atendimento urgente",
    },
    {
      id: "5",
      name: "Roberto Lima",
      company: "Indústria Omega Ltda",
      cnpj: "99.888.777/0001-66",
      email: "roberto@omega.com",
      phone: "(11) 96543-2109",
      source: "Cold Call",
      status: "new",
      value: 6800,
      priority: "medium",
      assignee: "Maria Santos",
      createdDate: "2026-03-16",
      nextFollowUp: "2026-03-18",
    },
    {
      id: "6",
      name: "Juliana Souza",
      company: "E-commerce Alpha ME",
      cnpj: "44.555.666/0001-22",
      email: "juliana@alpha.com",
      phone: "(11) 95432-1098",
      source: "Website",
      status: "won",
      value: 3500,
      priority: "high",
      assignee: "Carlos Oliveira",
      createdDate: "2026-03-01",
      lastContact: "2026-03-10",
      notes: "Cliente fechado - iniciar onboarding",
    },
    {
      id: "7",
      name: "Marcos Pereira",
      company: "Construções Sigma Ltda",
      cnpj: "33.444.555/0001-99",
      email: "marcos@sigma.com",
      phone: "(11) 94321-0987",
      source: "Indicação",
      status: "lost",
      value: 4200,
      priority: "low",
      assignee: "Maria Santos",
      createdDate: "2026-02-25",
      lastContact: "2026-03-05",
      notes: "Optou por outro fornecedor - preço",
    },
    {
      id: "8",
      name: "Fernanda Alves",
      company: "Marketing Epsilon ME",
      cnpj: "22.333.444/0001-77",
      email: "fernanda@epsilon.com",
      phone: "(11) 93210-9876",
      source: "WhatsApp",
      status: "paused",
      value: 2500,
      priority: "low",
      assignee: "Carlos Oliveira",
      createdDate: "2026-03-08",
      lastContact: "2026-03-12",
      notes: "Aguardando definição interna da empresa",
    },
  ];

  const proposals: Proposal[] = [
    {
      id: "1",
      lead: "Ana Costa",
      company: "Comércio Beta ME",
      services: ["Contabilidade", "Fiscal", "Departamento Pessoal"],
      monthlyValue: 2800,
      setupFee: 1500,
      validUntil: "2026-03-25",
      status: "sent",
      sentDate: "2026-03-15",
    },
    {
      id: "2",
      lead: "João Silva",
      company: "Tech Solutions Ltda",
      services: ["Contabilidade", "Fiscal"],
      monthlyValue: 4500,
      setupFee: 2000,
      validUntil: "2026-03-22",
      status: "viewed",
      sentDate: "2026-03-12",
      viewedDate: "2026-03-13",
    },
    {
      id: "3",
      lead: "Pedro Santos",
      company: "Serviços Gamma Ltda",
      services: ["Contabilidade"],
      monthlyValue: 3200,
      setupFee: 1200,
      validUntil: "2026-03-28",
      status: "draft",
    },
    {
      id: "4",
      lead: "Juliana Souza",
      company: "E-commerce Alpha ME",
      services: ["Contabilidade", "Fiscal", "Departamento Pessoal"],
      monthlyValue: 3500,
      setupFee: 1800,
      validUntil: "2026-03-15",
      status: "approved",
      sentDate: "2026-03-05",
      viewedDate: "2026-03-06",
    },
  ];

  const contracts: Contract[] = [
    {
      id: "1",
      company: "E-commerce Alpha ME",
      cnpj: "44.555.666/0001-22",
      type: "Completo",
      monthlyValue: 3500,
      startDate: "2026-03-15",
      status: "active",
      paymentDay: 10,
    },
    {
      id: "2",
      company: "Tech Prime Ltda",
      cnpj: "77.888.999/0001-33",
      type: "Contábil",
      monthlyValue: 4200,
      startDate: "2026-01-10",
      status: "active",
      paymentDay: 5,
    },
    {
      id: "3",
      company: "Serviços Pro ME",
      cnpj: "66.777.888/0001-55",
      type: "Fiscal",
      monthlyValue: 1800,
      startDate: "2025-11-20",
      endDate: "2026-03-10",
      status: "cancelled",
      paymentDay: 15,
    },
  ];

  const leadStatusConfig = {
    new: {
      label: "Novo",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: UserPlus,
    },
    contacted: {
      label: "Contatado",
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      icon: Phone,
    },
    qualified: {
      label: "Qualificado",
      color: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
      icon: CheckSquare,
    },
    proposal: {
      label: "Proposta Enviada",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: Send,
    },
    negotiation: {
      label: "Negociação",
      color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
      icon: MessageSquare,
    },
    won: {
      label: "Ganho",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: Award,
    },
    lost: {
      label: "Perdido",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
    paused: {
      label: "Pausado",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: PauseCircle,
    },
  } as const;

  const proposalStatusConfig = {
    draft: {
      label: "Rascunho",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: Edit,
    },
    sent: {
      label: "Enviada",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: Send,
    },
    viewed: {
      label: "Visualizada",
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      icon: Eye,
    },
    approved: {
      label: "Aprovada",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    rejected: {
      label: "Recusada",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
  } as const;

  const contractStatusConfig = {
    active: {
      label: "Ativo",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    suspended: {
      label: "Suspenso",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: PauseCircle,
    },
    cancelled: {
      label: "Cancelado",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
  } as const;

  const priorityConfig = {
    low: { label: "Baixa", color: "text-gray-600 dark:text-slate-400" },
    medium: { label: "Média", color: "text-yellow-600 dark:text-yellow-400" },
    high: { label: "Alta", color: "text-orange-600 dark:text-orange-400" },
    urgent: { label: "Urgente", color: "text-red-600 dark:text-red-400" },
  } as const;

  const totalLeads = leads.length;
  const activeLeads = leads.filter((l) => !["won", "lost"].includes(l.status)).length;
  const wonLeads = leads.filter((l) => l.status === "won").length;
  const totalValue = leads.filter((l) => l.status === "won").reduce((sum, l) => sum + l.value, 0);
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : "0";
  const activeProposals = proposals.filter((p) => ["sent", "viewed"].includes(p.status)).length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;

  const sourceData = [
    {
      name: "Website",
      value: leads.filter((l) => l.source === "Website").length,
      color: "#3b82f6",
    },
    {
      name: "Indicação",
      value: leads.filter((l) => l.source === "Indicação").length,
      color: "#10b981",
    },
    {
      name: "WhatsApp",
      value: leads.filter((l) => l.source === "WhatsApp").length,
      color: "#8b5cf6",
    },
    { name: "Onvio", value: leads.filter((l) => l.source === "Onvio").length, color: "#f59e0b" },
    {
      name: "Cold Call",
      value: leads.filter((l) => l.source === "Cold Call").length,
      color: "#ef4444",
    },
  ].filter((item) => item.value > 0);

  const monthlyConversions = [
    { month: "Out", leads: 12, won: 3, lost: 2 },
    { month: "Nov", leads: 15, won: 4, lost: 3 },
    { month: "Dez", leads: 18, won: 5, lost: 4 },
    { month: "Jan", leads: 14, won: 3, lost: 2 },
    { month: "Fev", leads: 16, won: 4, lost: 3 },
    { month: "Mar", leads: 8, won: 1, lost: 1 },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.company.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
      const matchesSource = filterSource === "all" || lead.source === filterSource;
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [leads, searchTerm, filterStatus, filterSource]);

  const getLeadsByStatus = (status: Lead["status"]) => {
    return leads.filter((l) => l.status === status);
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            Departamento Comercial
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Gestão de leads, propostas, contratos e pipeline de vendas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
            type="button"
          >
            <Upload className="w-5 h-5" />
            <span className="font-medium">Importar Leads</span>
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg"
            type="button"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Lead</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "dashboard"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            }`}
            type="button"
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("leads")}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "leads"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            }`}
            type="button"
          >
            <Users className="w-4 h-4 inline-block mr-2" />
            Leads
            {activeLeads > 0 ? (
              <span className="ml-2 px-2 py-0.5 bg-emerald-500 text-white rounded-full text-xs">
                {activeLeads}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "pipeline"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            }`}
            type="button"
          >
            <Activity className="w-4 h-4 inline-block mr-2" />
            Pipeline
          </button>
          <button
            onClick={() => setActiveTab("proposals")}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "proposals"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            }`}
            type="button"
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            Propostas
            {activeProposals > 0 ? (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                {activeProposals}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab("contracts")}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "contracts"
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
            }`}
            type="button"
          >
            <FileCheck className="w-4 h-4 inline-block mr-2" />
            Contratos
            {activeContracts > 0 ? (
              <span className="ml-2 px-2 py-0.5 bg-green-500 text-white rounded-full text-xs">
                {activeContracts}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Leads Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeLeads}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    de {totalLeads} totais
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Taxa de Conversão</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{conversionRate}%</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{wonLeads} ganhos</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Propostas Ativas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeProposals}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">aguardando resposta</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                  <FileText className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Receita Conquistada</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(totalValue)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">mensal</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Conversões Mensais
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Últimos 6 meses</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyConversions}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: "12px" }} />
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
                  <Bar dataKey="leads" name="Leads" fill="#3b82f6" />
                  <Bar dataKey="won" name="Ganhos" fill="#10b981" />
                  <Bar dataKey="lost" name="Perdidos" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Origem dos Leads
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Por canal de captação</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #1f2937",
                        borderRadius: "8px",
                        color: "#fff",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {sourceData.map((item) => (
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Pipeline de Vendas
                </h3>
                <button
                  onClick={() => setActiveTab("pipeline")}
                  className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
                  type="button"
                >
                  Ver pipeline
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(leadStatusConfig)
                  .filter(([key]) => !["won", "lost", "paused"].includes(key))
                  .map(([status, config]) => {
                    const count = leads.filter((l) => l.status === status).length;
                    const Icon = config.icon;

                    return (
                      <div
                        key={status}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/60 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 ${config.color} rounded-lg flex items-center justify-center`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{config.label}</p>
                            <p className="text-xs text-gray-600 dark:text-slate-400">{count} leads</p>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Follow-ups Pendentes
                </h3>
              </div>
              <div className="space-y-3">
                {leads
                  .filter((l) => l.nextFollowUp && !["won", "lost"].includes(l.status))
                  .sort((a, b) => new Date(a.nextFollowUp ?? 0).getTime() - new Date(b.nextFollowUp ?? 0).getTime())
                  .slice(0, 5)
                  .map((lead) => {
                    const StatusIcon = leadStatusConfig[lead.status].icon;
                    return (
                      <div
                        key={lead.id}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 rounded-lg transition-colors border border-gray-100 dark:border-slate-800"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{lead.name}</p>
                            <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">{lead.company}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${leadStatusConfig[lead.status].color} flex items-center gap-1`}
                          >
                            <StatusIcon className="w-3 h-3" />
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(lead.nextFollowUp ?? "")}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(lead.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "leads" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="new">Novo</option>
                  <option value="contacted">Contatado</option>
                  <option value="qualified">Qualificado</option>
                  <option value="proposal">Proposta Enviada</option>
                  <option value="negotiation">Negociação</option>
                  <option value="won">Ganho</option>
                  <option value="lost">Perdido</option>
                  <option value="paused">Pausado</option>
                </select>

                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">Todas as Origens</option>
                  <option value="Website">Website</option>
                  <option value="Indicação">Indicação</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Onvio">Onvio</option>
                  <option value="Cold Call">Cold Call</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Lead
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Contato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Origem
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Prioridade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Responsável
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                  {filteredLeads.map((lead) => {
                    const StatusIcon = leadStatusConfig[lead.status].icon;
                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{lead.name}</p>
                            <p className="text-sm text-gray-600 dark:text-slate-400">{lead.company}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="text-gray-900 dark:text-white flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </p>
                            <p className="text-gray-600 dark:text-slate-400 flex items-center gap-1 mt-1">
                              <Mail className="w-3 h-3" />
                              {lead.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(lead.value)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${leadStatusConfig[lead.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {leadStatusConfig[lead.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-medium ${priorityConfig[lead.priority].color}`}>
                            {priorityConfig[lead.priority].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{lead.assignee}</p>
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
                              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>
                            <button
                              className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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

      {activeTab === "pipeline" ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 p-1">
              <button
                onClick={() => setPipelineView("kanban")}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  pipelineView === "kanban"
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                type="button"
              >
                Kanban
              </button>
              <button
                onClick={() => setPipelineView("table")}
                className={`px-4 py-2 rounded-md font-medium transition-all ${
                  pipelineView === "table"
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                type="button"
              >
                Tabela
              </button>
            </div>
          </div>

          {pipelineView === "kanban" ? (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-max">
                {(["new", "contacted", "qualified", "proposal", "negotiation"] as Lead["status"][]).map(
                  (status) => {
                    const statusLeads = getLeadsByStatus(status);
                    const StatusIcon = leadStatusConfig[status].icon;

                    return (
                      <div key={status} className="flex-shrink-0 w-80">
                        <div className="bg-gray-50 dark:bg-slate-900/60 rounded-xl p-4 border border-gray-200 dark:border-slate-800">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-8 h-8 ${leadStatusConfig[status].color} rounded-lg flex items-center justify-center`}
                              >
                                <StatusIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                  {leadStatusConfig[status].label}
                                </h3>
                                <p className="text-xs text-gray-600 dark:text-slate-400">
                                  {statusLeads.length} leads
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {statusLeads.map((lead) => (
                              <div
                                key={lead.id}
                                className="bg-white dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-800 hover:shadow-md transition-all cursor-pointer"
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                                      {lead.name}
                                    </h4>
                                    <p className="text-xs text-gray-600 dark:text-slate-400">{lead.company}</p>
                                  </div>
                                  <button
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md"
                                    type="button"
                                  >
                                    <MoreVertical className="w-4 h-4 text-gray-400" />
                                  </button>
                                </div>

                                <div className="space-y-2 mb-3">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-slate-400">Valor:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {formatCurrency(lead.value)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-slate-400">Origem:</span>
                                    <span className="text-gray-900 dark:text-white">{lead.source}</span>
                                  </div>
                                  {lead.nextFollowUp ? (
                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-400">
                                      <Clock className="w-3 h-3" />
                                      Follow-up: {formatDate(lead.nextFollowUp)}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-800">
                                  <span className={`text-xs font-medium ${priorityConfig[lead.priority].color}`}>
                                    {priorityConfig[lead.priority].label}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md"
                                      type="button"
                                    >
                                      <Phone className="w-3.5 h-3.5 text-gray-600 dark:text-slate-300" />
                                    </button>
                                    <button
                                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md"
                                      type="button"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-gray-600 dark:text-slate-300" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Lead
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Valor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Prioridade
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Próximo Follow-up
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Responsável
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                    {leads
                      .filter((l) => !["won", "lost", "paused"].includes(l.status))
                      .map((lead) => {
                        const StatusIcon = leadStatusConfig[lead.status].icon;
                        return (
                          <tr
                            key={lead.id}
                            className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">{lead.name}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{lead.company}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {formatCurrency(lead.value)}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-medium ${leadStatusConfig[lead.status].color} flex items-center gap-1 w-fit`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {leadStatusConfig[lead.status].label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-sm font-medium ${priorityConfig[lead.priority].color}`}>
                                {priorityConfig[lead.priority].label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {lead.nextFollowUp ? (
                                <p className="text-sm text-gray-900 dark:text-white">
                                  {formatDate(lead.nextFollowUp)}
                                </p>
                              ) : (
                                <p className="text-sm text-gray-500">-</p>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-gray-900 dark:text-white">{lead.assignee}</p>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "proposals" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {proposals.map((proposal) => {
              const StatusIcon = proposalStatusConfig[proposal.status].icon;
              return (
                <div
                  key={proposal.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{proposal.lead}</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400">{proposal.company}</p>
                    </div>
                    <button
                      className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      type="button"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-3 mb-4 pb-4 border-b border-gray-100 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">Serviços:</p>
                      <div className="flex flex-wrap gap-1">
                        {proposal.services.map((service) => (
                          <span
                            key={service}
                            className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs"
                          >
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Valor Mensal:</span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(proposal.monthlyValue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Taxa de Setup:</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(proposal.setupFee)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Válida até:</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {formatDate(proposal.validUntil)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${proposalStatusConfig[proposal.status].color} flex items-center gap-1`}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {proposalStatusConfig[proposal.status].label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        type="button"
                      >
                        <Eye className="w-4 h-4 text-gray-600 dark:text-slate-300" />
                      </button>
                      <button
                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                        type="button"
                      >
                        <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </button>
                      {proposal.status === "draft" ? (
                        <button
                          className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                          type="button"
                        >
                          <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "contracts" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Empresa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor Mensal
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Início
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Dia Pagamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                  {contracts.map((contract) => {
                    const StatusIcon = contractStatusConfig[contract.status].icon;
                    return (
                      <tr
                        key={contract.id}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{contract.company}</p>
                            <p className="text-sm text-gray-600 dark:text-slate-400">{contract.cnpj}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                            {contract.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(contract.monthlyValue)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(contract.startDate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">Dia {contract.paymentDay}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${contractStatusConfig[contract.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {contractStatusConfig[contract.status].label}
                          </span>
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
                              className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                              type="button"
                            >
                              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>
                            {contract.status === "active" ? (
                              <button
                                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors"
                                type="button"
                              >
                                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              </button>
                            ) : null}
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
    </div>
  );
}

