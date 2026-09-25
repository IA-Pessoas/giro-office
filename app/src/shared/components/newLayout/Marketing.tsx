import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  CheckSquare,
  Clock,
  DollarSign,
  Download,
  Edit,
  Eye,
  Filter,
  Gift,
  Heart,
  Inbox,
  Lightbulb,
  Mail,
  Megaphone,
  MoreVertical,
  Package,
  PartyPopper,
  Phone,
  PieChart as PieChartIcon,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  User,
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
import { getSummaryItems } from "../../utils/summaryItems";
import { formatCount } from "@shared/utils/formatters";

interface Budget {
  id: string;
  name: string;
  campaign: string;
  items: BudgetItem[];
  totalValue: number;
  destination: "Endomarketing" | "Campanha Externa" | "Evento" | "Branding";
  status: "draft" | "pending" | "approved" | "rejected" | "executed";
  requestDate: string;
  approvalDate?: string;
  supplier?: string;
  notes?: string;
}

interface BudgetItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Supplier {
  id: string;
  name: string;
  cnpj: string;
  contact: string;
  email: string;
  phone: string;
  category: "Gráfica" | "Brindes" | "Alimentação" | "Decoração" | "Tecnologia" | "Serviços";
  paymentTerms: string;
  totalSpent: number;
  ordersCount: number;
}

interface Campaign {
  id: string;
  name: string;
  type: "Endomarketing" | "Campanha Externa" | "Evento" | "Branding";
  description: string;
  startDate: string;
  endDate?: string;
  budget: number;
  spent: number;
  status: "planning" | "in-progress" | "completed" | "cancelled";
  target: string;
  responsible: string;
  materials?: string[];
}

interface Request {
  id: string;
  title: string;
  from: string;
  department: "RH" | "Comercial" | "TI" | "Financeiro" | "Departamento Pessoal";
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "completed" | "cancelled";
  requestDate: string;
  deadline?: string;
  assignee: string;
  deliverables?: string[];
}

export function Marketing() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "budgets" | "suppliers" | "campaigns" | "requests"
  >("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const budgets: Budget[] = [
    {
      id: "1",
      name: "Orçamento Páscoa 2026",
      campaign: "Páscoa Corporativa",
      items: [
        { id: "1", description: "Ovos de Páscoa Premium 250g", quantity: 50, unitPrice: 45, total: 2250 },
        { id: "2", description: "Embalagens personalizadas", quantity: 50, unitPrice: 15, total: 750 },
        { id: "3", description: "Cartões personalizados", quantity: 50, unitPrice: 8, total: 400 },
      ],
      totalValue: 3400,
      destination: "Endomarketing",
      status: "approved",
      requestDate: "2026-03-01",
      approvalDate: "2026-03-05",
      supplier: "Chocolates Premium Ltda",
      notes: "Entrega até 10/04/2026",
    },
    {
      id: "2",
      name: "Material Gráfico - Campanha",
      campaign: "Campanha de Marca Q1",
      items: [
        { id: "1", description: "Banners roll-up", quantity: 10, unitPrice: 180, total: 1800 },
        { id: "2", description: "Flyers 4x0 - 5000 unidades", quantity: 1, unitPrice: 850, total: 850 },
        { id: "3", description: "Adesivos personalizados", quantity: 1000, unitPrice: 2.5, total: 2500 },
      ],
      totalValue: 5150,
      destination: "Campanha Externa",
      status: "pending",
      requestDate: "2026-03-10",
      supplier: "Gráfica Express S/A",
    },
    {
      id: "3",
      name: "Brindes Aniversariantes Março",
      campaign: "Aniversariantes do Mês",
      items: [
        { id: "1", description: "Canecas personalizadas", quantity: 12, unitPrice: 35, total: 420 },
        { id: "2", description: "Kits de chocolates", quantity: 12, unitPrice: 28, total: 336 },
        { id: "3", description: "Cartões de felicitações", quantity: 12, unitPrice: 12, total: 144 },
      ],
      totalValue: 900,
      destination: "Endomarketing",
      status: "executed",
      requestDate: "2026-02-15",
      approvalDate: "2026-02-18",
      supplier: "Brindes & Cia",
    },
    {
      id: "4",
      name: "Coffee Break - Evento Interno",
      campaign: "Workshop de Integração",
      items: [
        { id: "1", description: "Coffee break completo - 40 pessoas", quantity: 1, unitPrice: 1800, total: 1800 },
        { id: "2", description: "Decoração temática", quantity: 1, unitPrice: 600, total: 600 },
      ],
      totalValue: 2400,
      destination: "Evento",
      status: "approved",
      requestDate: "2026-03-08",
      approvalDate: "2026-03-12",
      supplier: "Buffet Corporativo ME",
      notes: "Evento dia 25/03/2026",
    },
    {
      id: "5",
      name: "Materiais Digitais - Redes Sociais",
      campaign: "Conteúdo Digital Q1",
      items: [
        { id: "1", description: "Produção de vídeos (3 unidades)", quantity: 3, unitPrice: 800, total: 2400 },
        { id: "2", description: "Artes para posts - pacote mensal", quantity: 1, unitPrice: 1200, total: 1200 },
      ],
      totalValue: 3600,
      destination: "Campanha Externa",
      status: "draft",
      requestDate: "2026-03-14",
    },
  ];

  const suppliers: Supplier[] = [
    {
      id: "1",
      name: "Chocolates Premium Ltda",
      cnpj: "12.345.678/0001-90",
      contact: "Maria Silva",
      email: "contato@chocolatespremium.com",
      phone: "(11) 98765-4321",
      category: "Alimentação",
      paymentTerms: "30 dias",
      totalSpent: 8500,
      ordersCount: 5,
    },
    {
      id: "2",
      name: "Gráfica Express S/A",
      cnpj: "98.765.432/0001-11",
      contact: "João Santos",
      email: "vendas@graficaexpress.com",
      phone: "(11) 91234-5678",
      category: "Gráfica",
      paymentTerms: "15 dias",
      totalSpent: 15200,
      ordersCount: 8,
    },
    {
      id: "3",
      name: "Brindes & Cia",
      cnpj: "11.222.333/0001-44",
      contact: "Ana Costa",
      email: "ana@brindesco.com",
      phone: "(11) 99876-5432",
      category: "Brindes",
      paymentTerms: "30 dias",
      totalSpent: 6800,
      ordersCount: 12,
    },
    {
      id: "4",
      name: "Buffet Corporativo ME",
      cnpj: "55.666.777/0001-88",
      contact: "Carlos Mendes",
      email: "carlos@buffetcorp.com",
      phone: "(11) 97654-3210",
      category: "Alimentação",
      paymentTerms: "7 dias",
      totalSpent: 12400,
      ordersCount: 6,
    },
    {
      id: "5",
      name: "Decor Eventos Ltda",
      cnpj: "99.888.777/0001-66",
      contact: "Patrícia Lima",
      email: "patricia@decoreventos.com",
      phone: "(11) 96543-2109",
      category: "Decoração",
      paymentTerms: "15 dias",
      totalSpent: 9300,
      ordersCount: 4,
    },
  ];

  const campaigns: Campaign[] = [
    {
      id: "1",
      name: "Páscoa Corporativa",
      type: "Endomarketing",
      description: "Distribuição de ovos de páscoa para colaboradores",
      startDate: "2026-04-01",
      endDate: "2026-04-15",
      budget: 5000,
      spent: 3400,
      status: "in-progress",
      target: "Colaboradores internos",
      responsible: "Juliana Costa",
      materials: ["Ovos de páscoa", "Embalagens", "Cartões"],
    },
    {
      id: "2",
      name: "Campanha de Marca Q1",
      type: "Campanha Externa",
      description: "Reforço da marca no mercado regional",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      budget: 15000,
      spent: 5150,
      status: "in-progress",
      target: "Prospects e leads",
      responsible: "Roberto Alves",
      materials: ["Banners", "Flyers", "Adesivos", "Posts digitais"],
    },
    {
      id: "3",
      name: "Aniversariantes do Mês",
      type: "Endomarketing",
      description: "Programa mensal de reconhecimento de aniversariantes",
      startDate: "2026-01-01",
      budget: 12000,
      spent: 2700,
      status: "in-progress",
      target: "Colaboradores",
      responsible: "Juliana Costa",
      materials: ["Canecas", "Chocolates", "Cartões"],
    },
    {
      id: "4",
      name: "Workshop de Integração",
      type: "Evento",
      description: "Evento de integração e capacitação da equipe",
      startDate: "2026-03-25",
      endDate: "2026-03-25",
      budget: 8000,
      spent: 2400,
      status: "planning",
      target: "Todos os departamentos",
      responsible: "Juliana Costa",
      materials: ["Coffee break", "Decoração", "Materiais didáticos"],
    },
    {
      id: "5",
      name: "Rebranding Institucional",
      type: "Branding",
      description: "Atualização da identidade visual da empresa",
      startDate: "2026-02-01",
      endDate: "2026-05-31",
      budget: 35000,
      spent: 18500,
      status: "in-progress",
      target: "Institucional",
      responsible: "Roberto Alves",
      materials: ["Logo", "Manual de marca", "Papelaria", "Website"],
    },
  ];

  const requests: Request[] = [
    {
      id: "1",
      title: "Material gráfico para recrutamento",
      from: "Ana Costa",
      department: "RH",
      description: "Criação de materiais para divulgação de vagas abertas",
      priority: "high",
      status: "in-progress",
      requestDate: "2026-03-12",
      deadline: "2026-03-20",
      assignee: "Roberto Alves",
      deliverables: ["Posts para redes sociais", "Banner para site", "Email marketing"],
    },
    {
      id: "2",
      title: "Apresentação comercial institucional",
      from: "Carlos Oliveira",
      department: "Comercial",
      description: "Atualizar apresentação institucional para prospecção",
      priority: "medium",
      status: "pending",
      requestDate: "2026-03-14",
      deadline: "2026-03-25",
      assignee: "Juliana Costa",
      deliverables: ["Apresentação PowerPoint", "Folheto impresso"],
    },
    {
      id: "3",
      title: "Banners para evento de integração",
      from: "Maria Santos",
      department: "RH",
      description: "Criação de banners e sinalização para workshop",
      priority: "urgent",
      status: "in-progress",
      requestDate: "2026-03-10",
      deadline: "2026-03-22",
      assignee: "Roberto Alves",
      deliverables: ["3 banners roll-up", "Placas de sinalização", "Crachás"],
    },
    {
      id: "4",
      title: "Material de comunicação interna",
      from: "Pedro Ferreira",
      department: "TI",
      description: "Comunicado sobre novo sistema interno",
      priority: "low",
      status: "completed",
      requestDate: "2026-03-05",
      deadline: "2026-03-15",
      assignee: "Juliana Costa",
      deliverables: ["Email comunicado", "Banner interno", "FAQ"],
    },
    {
      id: "5",
      title: "Campanha de fim de ano",
      from: "Ana Costa",
      department: "RH",
      description: "Planejamento de campanha de final de ano para colaboradores",
      priority: "medium",
      status: "pending",
      requestDate: "2026-03-15",
      assignee: "Juliana Costa",
    },
  ];

  const budgetStatusConfig = {
    draft: {
      label: "Rascunho",
      color: "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200",
      icon: Edit,
    },
    pending: {
      label: "Pendente",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: Clock,
    },
    approved: {
      label: "Aprovado",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    rejected: {
      label: "Rejeitado",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
    executed: {
      label: "Executado",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: CheckSquare,
    },
  } as const;

  const campaignStatusConfig = {
    planning: {
      label: "Planejamento",
      color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      icon: Lightbulb,
    },
    "in-progress": {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: TrendingUp,
    },
    completed: {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    cancelled: {
      label: "Cancelada",
      color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      icon: XCircle,
    },
  } as const;

  const requestStatusConfig = {
    pending: {
      label: "Pendente",
      color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
      icon: Clock,
    },
    "in-progress": {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      icon: TrendingUp,
    },
    completed: {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      icon: CheckCircle,
    },
    cancelled: {
      label: "Cancelada",
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

  const totalBudgets = budgets.length;
  const pendingBudgets = budgets.filter((b) => b.status === "pending").length;
  const totalBudgetValue = budgets.reduce((sum, b) => sum + b.totalValue, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === "in-progress").length;
  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "in-progress").length;

  const destinationData = [
    {
      name: "Endomarketing",
      value: budgets
        .filter((b) => b.destination === "Endomarketing")
        .reduce((s, b) => s + b.totalValue, 0),
      color: "#10b981",
    },
    {
      name: "Campanha Externa",
      value: budgets
        .filter((b) => b.destination === "Campanha Externa")
        .reduce((s, b) => s + b.totalValue, 0),
      color: "#3b82f6",
    },
    {
      name: "Evento",
      value: budgets.filter((b) => b.destination === "Evento").reduce((s, b) => s + b.totalValue, 0),
      color: "#f59e0b",
    },
    {
      name: "Branding",
      value: budgets.filter((b) => b.destination === "Branding").reduce((s, b) => s + b.totalValue, 0),
      color: "#8b5cf6",
    },
  ].filter((item) => item.value > 0);

  const monthlySpending = [
    { month: "Out", budget: 12, spent: 10.5 },
    { month: "Nov", budget: 15, spent: 13.2 },
    { month: "Dez", budget: 18, spent: 16.8 },
    { month: "Jan", budget: 14, spent: 12.9 },
    { month: "Fev", budget: 16, spent: 14.5 },
    { month: "Mar", budget: 15.5, spent: 11.8 },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      const matchesSearch =
        budget.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        budget.campaign.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || budget.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [budgets, searchTerm, filterStatus]);

  const recentRequestsSummary = getSummaryItems(
    requests.filter((request) => request.status !== "completed"),
    4,
  );

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center">
              <Megaphone className="w-6 h-6 text-white" />
            </div>
            Departamento de Marketing
          </h1>
          <p className="text-gray-600 dark:text-slate-400">
            Gestão de orçamentos, campanhas, fornecedores e solicitações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
            type="button"
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">Exportar Relatório</span>
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-pink-700 text-white rounded-lg hover:from-pink-700 hover:to-pink-800 transition-all shadow-md hover:shadow-lg"
            type="button"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Orçamento</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-1">
        <div className="flex items-center gap-1 overflow-x-auto u-scrollbar-system">
          {(
            [
              { id: "dashboard", label: "Dashboard", icon: BarChart3 },
              { id: "budgets", label: "Orçamentos", icon: DollarSign, badge: pendingBudgets || 0 },
              { id: "suppliers", label: "Fornecedores", icon: Package },
              { id: "campaigns", label: "Campanhas", icon: Target, badge: activeCampaigns || 0 },
              { id: "requests", label: "Solicitações", icon: Inbox, badge: pendingRequests || 0 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                }`}
                type="button"
              >
                <Icon className="w-4 h-4 inline-block mr-2" />
                {tab.label}
                {"badge" in tab && tab.badge ? (
                  <span
                    className={`ml-2 px-2 py-0.5 text-white rounded-full text-xs ${
                      tab.id === "budgets" ? "bg-yellow-500" : tab.id === "campaigns" ? "bg-blue-500" : "bg-pink-500"
                    }`}
                  >
                    {tab.badge}
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
            <div
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 group relative"
              title={formatCurrency(totalBudgetValue)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Total em Orçamentos</p>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-tight truncate">
                    {formatCurrency(totalBudgetValue)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{totalBudgets} orçamentos</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="pointer-events-none absolute left-4 -bottom-9 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {formatCurrency(totalBudgetValue)}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Campanhas Ativas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeCampaigns}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    de {campaigns.length} totais
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Target className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Pendente Aprovação</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingBudgets}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">orçamentos</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mb-1">Solicitações Ativas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingRequests}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    de {requests.length} totais
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Inbox className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Orçamento vs Gasto
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  Últimos 6 meses (em milhares)
                </p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlySpending}>
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
                    formatter={(value: number) => `R$ ${value}k`}
                  />
                  <Legend />
                  <Bar dataKey="budget" name="Orçado" fill="#3b82f6" />
                  <Bar dataKey="spent" name="Gasto" fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Distribuição por Destino
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Gastos por categoria</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={destinationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {destinationData.map((entry, index) => (
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
                      formatter={(value: number) => formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {destinationData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-gray-700 dark:text-slate-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(item.value)}
                      </span>
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
                  <Clock className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Pendente de Aprovação
                </h3>
                <button
                  onClick={() => setActiveTab("budgets")}
                  className="text-sm text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-medium"
                  type="button"
                >
                  Ver todos
                </button>
              </div>
              <div className="space-y-3">
                {budgets.filter((b) => b.status === "pending").map((budget) => {
                  const StatusIcon = budgetStatusConfig[budget.status].icon;
                  return (
                    <div
                      key={budget.id}
                      className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 rounded-lg transition-colors border border-gray-100 dark:border-slate-800"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{budget.name}</p>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">{budget.campaign}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${budgetStatusConfig[budget.status].color} flex items-center gap-1`}
                        >
                          <StatusIcon className="w-3 h-3" />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-slate-400">{budget.destination}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(budget.totalValue)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {budgets.filter((b) => b.status === "pending").length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">
                    Nenhum orçamento pendente
                  </p>
                ) : null}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Solicitações Recentes
                </h3>
                <button
                  onClick={() => setActiveTab("requests")}
                  className="text-sm text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-medium"
                  type="button"
                >
                  Ver todas{recentRequestsSummary.hasHiddenItems ? ` (${recentRequestsSummary.total})` : ""}
                </button>
              </div>
              <div className="space-y-3">
                {recentRequestsSummary.items
                  .map((request) => {
                    const StatusIcon = requestStatusConfig[request.status].icon;
                    return (
                      <div
                        key={request.id}
                        className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 rounded-lg transition-colors border border-gray-100 dark:border-slate-800"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{request.title}</p>
                            <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                              {request.department} • {request.from}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${requestStatusConfig[request.status].color} flex items-center gap-1`}
                          >
                            <StatusIcon className="w-3 h-3" />
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-medium ${priorityConfig[request.priority].color}`}>
                            {priorityConfig[request.priority].label}
                          </span>
                          {request.deadline ? (
                            <span className="text-gray-600 dark:text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(request.deadline)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "budgets" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar orçamentos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="draft">Rascunho</option>
                  <option value="pending">Pendente</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Rejeitado</option>
                  <option value="executed">Executado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Orçamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Campanha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Destino
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Fornecedor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Data
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBudgets.map((budget) => {
                    const StatusIcon = budgetStatusConfig[budget.status].icon;
                    return (
                      <tr
                        key={budget.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-slate-900 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-slate-800 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900 dark:text-white">{budget.name}</p>
                          <p className="text-xs text-gray-600 dark:text-slate-400">{formatCount(budget.items.length, "item", "itens")}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{budget.campaign}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                            {budget.destination}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{budget.supplier || "-"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(budget.totalValue)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${budgetStatusConfig[budget.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {budgetStatusConfig[budget.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(budget.requestDate)}</p>
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
                            {budget.status === "draft" ? (
                              <button
                                className="p-1.5 hover:bg-pink-100 dark:hover:bg-pink-900/30 rounded-md transition-colors"
                                type="button"
                              >
                                <Send className="w-4 h-4 text-pink-600 dark:text-pink-400" />
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

      {activeTab === "suppliers" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-600 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{supplier.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400">{supplier.cnpj}</p>
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
                    <span className="text-sm text-gray-600 dark:text-slate-400">Categoria:</span>
                    <span className="px-2.5 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded-full text-xs font-medium">
                      {supplier.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-slate-400">Contato:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{supplier.contact}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-slate-400">Total Gasto:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(supplier.totalSpent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-slate-400">Pedidos:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{supplier.ordersCount}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                    <Phone className="w-3 h-3" />
                    <span>{supplier.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400 mt-1">
                    <Mail className="w-3 h-3" />
                    <span>{supplier.email}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "campaigns" ? (
        <div className="space-y-5">
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const StatusIcon = campaignStatusConfig[campaign.status].icon;
              const budgetUsage = campaign.budget > 0 ? (campaign.spent / campaign.budget) * 100 : 0;
              const typeIcon =
                campaign.type === "Endomarketing"
                  ? Heart
                  : campaign.type === "Campanha Externa"
                    ? Megaphone
                    : campaign.type === "Evento"
                      ? PartyPopper
                      : Sparkles;
              const TypeIcon = typeIcon;

              return (
                <div
                  key={campaign.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-lg ${
                        campaign.type === "Endomarketing"
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                          : campaign.type === "Campanha Externa"
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            : campaign.type === "Evento"
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                              : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                      } flex items-center justify-center flex-shrink-0`}
                    >
                      <TypeIcon className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{campaign.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-slate-400">{campaign.description}</p>
                        </div>
                        <button
                          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                          type="button"
                        >
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">Tipo</p>
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                            {campaign.type}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">Orçamento</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(campaign.budget)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">Gasto</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(campaign.spent)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-slate-400 mb-1">Status</p>
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${campaignStatusConfig[campaign.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {campaignStatusConfig[campaign.status].label}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 dark:text-slate-400">Utilização do Orçamento</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{budgetUsage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              budgetUsage > 90 ? "bg-red-500" : budgetUsage > 70 ? "bg-yellow-500" : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(campaign.startDate)}
                          {campaign.endDate ? ` - ${formatDate(campaign.endDate)}` : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {campaign.target}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {campaign.responsible}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "requests" ? (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Solicitação
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Departamento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Solicitante
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Prioridade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Prazo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Responsável
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => {
                    const StatusIcon = requestStatusConfig[request.status].icon;
                    return (
                      <tr
                        key={request.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-slate-900 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-slate-800 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-slate-800/60 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{request.title}</p>
                            <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 max-w-xs truncate">
                              {request.description}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 rounded-full text-xs font-medium">
                            {request.department}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{request.from}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-medium ${priorityConfig[request.priority].color}`}>
                            {priorityConfig[request.priority].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {request.deadline ? (
                            <p className="text-sm text-gray-900 dark:text-white">{formatDate(request.deadline)}</p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${requestStatusConfig[request.status].color} flex items-center gap-1 w-fit`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {requestStatusConfig[request.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{request.assignee}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                              type="button"
                            >
                              <Eye className="w-4 h-4 text-gray-600 dark:text-slate-300" />
                            </button>
                            {request.status !== "completed" ? (
                              <button
                                className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors"
                                type="button"
                              >
                                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
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

      {filterType !== "all" ? (
        <div className="hidden">
          <Gift />
          <AlertTriangle />
          <TrendingDown />
          <Upload />
          <Send />
        </div>
      ) : null}
    </div>
  );
}
