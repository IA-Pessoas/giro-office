import { useState } from 'react';
import { 
  Calculator,
  Plus,
  Search,
  Filter,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  FileText,
  Download,
  Upload,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  AlertTriangle,
  CheckSquare,
  XCircle,
  BarChart3,
  PieChart as PieChartIcon,
  Bell,
  FileCheck,
  FileDown,
  RefreshCw,
  Archive,
  ListChecks,
  BookOpen,
  Layers,
  Target,
  TrendingDown,
  CircleDot,
  Activity
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Company {
  id: string;
  name: string;
  cnpj: string;
  regime: 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real';
  segment: string;
  responsible: string;
  status: 'active' | 'inactive';
  monthlyFee: number;
}

interface Competence {
  id: string;
  company: string;
  period: string;
  status: 'pending' | 'in-progress' | 'review' | 'closed' | 'late';
  entries: number;
  documents: number;
  closingDate?: string;
  responsible: string;
  dueDate: string;
}

interface Entry {
  id: string;
  company: string;
  period: string;
  date: string;
  type: 'Receita' | 'Despesa' | 'Ativo' | 'Passivo' | 'PL';
  account: string;
  description: string;
  debit: number;
  credit: number;
  document?: string;
}

interface Report {
  id: string;
  name: string;
  type: 'Balanço' | 'DRE' | 'Balancete' | 'Razão' | 'Diário';
  company: string;
  period: string;
  generatedDate: string;
  status: 'draft' | 'ready' | 'sent';
}

export function Contabil() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'companies' | 'competences' | 'entries' | 'reports'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegime, setFilterRegime] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const companies: Company[] = [
    {
      id: '1',
      name: 'Tech Solutions Ltda',
      cnpj: '12.345.678/0001-90',
      regime: 'Simples Nacional',
      segment: 'Tecnologia',
      responsible: 'Ana Costa',
      status: 'active',
      monthlyFee: 2500
    },
    {
      id: '2',
      name: 'Comércio Beta S/A',
      cnpj: '98.765.432/0001-10',
      regime: 'Lucro Presumido',
      segment: 'Comércio',
      responsible: 'Carlos Oliveira',
      status: 'active',
      monthlyFee: 3500
    },
    {
      id: '3',
      name: 'Serviços Gamma Ltda',
      cnpj: '11.222.333/0001-44',
      regime: 'Simples Nacional',
      segment: 'Serviços',
      responsible: 'Ana Costa',
      status: 'active',
      monthlyFee: 1800
    },
    {
      id: '4',
      name: 'Indústria Delta S/A',
      cnpj: '55.666.777/0001-88',
      regime: 'Lucro Real',
      segment: 'Indústria',
      responsible: 'Maria Santos',
      status: 'active',
      monthlyFee: 5000
    },
    {
      id: '5',
      name: 'Consultoria Omega ME',
      cnpj: '99.888.777/0001-66',
      regime: 'Simples Nacional',
      segment: 'Consultoria',
      responsible: 'Ana Costa',
      status: 'active',
      monthlyFee: 1500
    },
  ];

  const competences: Competence[] = [
    {
      id: '1',
      company: 'Tech Solutions Ltda',
      period: '02/2026',
      status: 'in-progress',
      entries: 145,
      documents: 89,
      responsible: 'Ana Costa',
      dueDate: '2026-03-15'
    },
    {
      id: '2',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      status: 'review',
      entries: 278,
      documents: 156,
      responsible: 'Carlos Oliveira',
      dueDate: '2026-03-15'
    },
    {
      id: '3',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      status: 'pending',
      entries: 0,
      documents: 0,
      responsible: 'Maria Santos',
      dueDate: '2026-03-15'
    },
    {
      id: '4',
      company: 'Serviços Gamma Ltda',
      period: '02/2026',
      status: 'closed',
      entries: 98,
      documents: 67,
      closingDate: '2026-03-10',
      responsible: 'Ana Costa',
      dueDate: '2026-03-15'
    },
    {
      id: '5',
      company: 'Consultoria Omega ME',
      period: '02/2026',
      status: 'late',
      entries: 42,
      documents: 28,
      responsible: 'Ana Costa',
      dueDate: '2026-03-05'
    },
    {
      id: '6',
      company: 'Tech Solutions Ltda',
      period: '01/2026',
      status: 'closed',
      entries: 138,
      documents: 82,
      closingDate: '2026-02-12',
      responsible: 'Ana Costa',
      dueDate: '2026-02-15'
    },
  ];

  const entries: Entry[] = [
    {
      id: '1',
      company: 'Tech Solutions Ltda',
      period: '02/2026',
      date: '2026-02-05',
      type: 'Receita',
      account: '3.1.1.01 - Receita de Serviços',
      description: 'Receita de desenvolvimento de software',
      debit: 0,
      credit: 145000,
      document: 'NF-e 1234'
    },
    {
      id: '2',
      company: 'Tech Solutions Ltda',
      period: '02/2026',
      date: '2026-02-05',
      type: 'Ativo',
      account: '1.1.1.01 - Caixa',
      description: 'Recebimento de serviços',
      debit: 145000,
      credit: 0,
      document: 'NF-e 1234'
    },
    {
      id: '3',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      date: '2026-02-08',
      type: 'Despesa',
      account: '4.1.1.01 - Aluguel',
      description: 'Aluguel de imóvel comercial',
      debit: 8500,
      credit: 0,
      document: 'Recibo 456'
    },
    {
      id: '4',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      date: '2026-02-08',
      type: 'Passivo',
      account: '2.1.1.01 - Fornecedores',
      description: 'Aluguel a pagar',
      debit: 0,
      credit: 8500,
      document: 'Recibo 456'
    },
    {
      id: '5',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      date: '2026-02-12',
      type: 'Despesa',
      account: '4.1.2.01 - Salários',
      description: 'Folha de pagamento fevereiro',
      debit: 520000,
      credit: 0,
      document: 'Folha 02/2026'
    },
  ];

  const reports: Report[] = [
    {
      id: '1',
      name: 'Balanço Patrimonial',
      type: 'Balanço',
      company: 'Tech Solutions Ltda',
      period: '01/2026',
      generatedDate: '2026-02-15',
      status: 'sent'
    },
    {
      id: '2',
      name: 'DRE - Demonstração do Resultado',
      type: 'DRE',
      company: 'Comércio Beta S/A',
      period: '01/2026',
      generatedDate: '2026-02-14',
      status: 'ready'
    },
    {
      id: '3',
      name: 'Balancete de Verificação',
      type: 'Balancete',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      generatedDate: '2026-03-05',
      status: 'draft'
    },
    {
      id: '4',
      name: 'Livro Razão',
      type: 'Razão',
      company: 'Serviços Gamma Ltda',
      period: '02/2026',
      generatedDate: '2026-03-10',
      status: 'ready'
    },
  ];

  const competenceStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Clock },
    'in-progress': { label: 'Em Andamento', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: RefreshCw },
    review: { label: 'Em Revisão', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Eye },
    closed: { label: 'Fechado', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    late: { label: 'Atrasado', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertTriangle },
  };

  const entryTypeConfig = {
    'Receita': { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: TrendingUp },
    'Despesa': { color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: TrendingDown },
    'Ativo': { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: CircleDot },
    'Passivo': { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: CircleDot },
    'PL': { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', icon: CircleDot },
  };

  const reportTypeConfig = {
    'Balanço': { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Layers },
    'DRE': { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: TrendingUp },
    'Balancete': { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', icon: BookOpen },
    'Razão': { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: FileText },
    'Diário': { color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300', icon: Calendar },
  };

  const reportStatusConfig = {
    draft: { label: 'Rascunho', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Edit },
    ready: { label: 'Pronto', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: CheckCircle },
    sent: { label: 'Enviado', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckSquare },
  };

  // Stats
  const totalCompanies = companies.filter(c => c.status === 'active').length;
  const totalRevenue = companies.reduce((sum, c) => sum + c.monthlyFee, 0);
  const pendingCompetences = competences.filter(c => c.status !== 'closed').length;
  const lateCompetences = competences.filter(c => c.status === 'late').length;
  const totalEntries = competences.reduce((sum, c) => sum + c.entries, 0);

  // Competence status distribution
  const statusData = [
    { name: 'Fechados', value: competences.filter(c => c.status === 'closed').length, color: '#10b981' },
    { name: 'Em Andamento', value: competences.filter(c => c.status === 'in-progress').length, color: '#3b82f6' },
    { name: 'Em Revisão', value: competences.filter(c => c.status === 'review').length, color: '#f59e0b' },
    { name: 'Pendentes', value: competences.filter(c => c.status === 'pending').length, color: '#6b7280' },
    { name: 'Atrasados', value: competences.filter(c => c.status === 'late').length, color: '#ef4444' },
  ].filter(item => item.value > 0);

  // Monthly entries (last 6 months)
  const monthlyEntriesData = [
    { month: 'Out', entries: 520, companies: 4 },
    { month: 'Nov', entries: 485, companies: 4 },
    { month: 'Dez', entries: 610, companies: 5 },
    { month: 'Jan', entries: 558, companies: 5 },
    { month: 'Fev', entries: 563, companies: 5 },
    { month: 'Mar', entries: 450, companies: 5 },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const filteredCompetences = competences.filter(comp => {
    const matchesSearch = comp.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPeriod = filterPeriod === 'all' || comp.period === filterPeriod;
    const matchesStatus = filterStatus === 'all' || comp.status === filterStatus;
    return matchesSearch && matchesPeriod && matchesStatus;
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-sky-600 rounded-xl flex items-center justify-center">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            Departamento Contábil
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de lançamentos contábeis, fechamento mensal e relatórios
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <Upload className="w-5 h-5" />
            <span className="font-medium">Importar Lançamentos</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-lg hover:from-sky-700 hover:to-sky-800 transition-all shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'companies'
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Building2 className="w-4 h-4 inline-block mr-2" />
            Empresas
          </button>
          <button
            onClick={() => setActiveTab('competences')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'competences'
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4 inline-block mr-2" />
            Competências
            {lateCompetences > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {lateCompetences}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'entries'
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4 inline-block mr-2" />
            Lançamentos
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'reports'
                ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FileCheck className="w-4 h-4 inline-block mr-2" />
            Relatórios
          </button>
        </div>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Empresas Ativas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalCompanies}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 group relative"
              title={formatCurrency(totalRevenue)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Receita Mensal</p>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white leading-tight truncate">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="pointer-events-none absolute left-4 -bottom-9 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {formatCurrency(totalRevenue)}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Lançamentos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalEntries}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Activity className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Competências Atrasadas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{lateCompetences}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Entries */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  Evolução de Lançamentos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Últimos 6 meses</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={monthlyEntriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="month" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: 'none', 
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Area type="monotone" dataKey="entries" name="Lançamentos" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Status Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  Status das Competências
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Distribuição atual</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {statusData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Alerts and Recent Activities */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Critical Alerts */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  Alertas e Pendências
                </h3>
              </div>
              <div className="space-y-3">
                {/* Late Competences */}
                {competences.filter(c => c.status === 'late').map((comp) => (
                  <div key={comp.id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Competência Atrasada - {comp.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Período: {comp.period} • Vencimento: {formatDate(comp.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Pending Competences */}
                {competences.filter(c => c.status === 'pending').slice(0, 2).map((comp) => (
                  <div key={comp.id} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Competência Pendente - {comp.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Período: {comp.period} • Prazo: {formatDate(comp.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* In Review */}
                {competences.filter(c => c.status === 'review').map((comp) => (
                  <div key={comp.id} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Em Revisão - {comp.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {comp.entries} lançamentos • {comp.documents} documentos
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Closings */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  Fechamentos Recentes
                </h3>
                <button 
                  onClick={() => setActiveTab('competences')}
                  className="text-sm text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3">
                {competences.filter(c => c.status === 'closed').slice(0, 4).map((comp) => (
                  <div key={comp.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{comp.company}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Período: {comp.period} • Fechado em: {comp.closingDate && formatDate(comp.closingDate)}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Fechado
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>{comp.entries} lançamentos</span>
                      <span>•</span>
                      <span>{comp.documents} documentos</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Companies Tab */}
      {activeTab === 'companies' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar empresas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterRegime}
                  onChange={(e) => setFilterRegime(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Todos os Regimes</option>
                  <option value="Simples Nacional">Simples Nacional</option>
                  <option value="Lucro Presumido">Lucro Presumido</option>
                  <option value="Lucro Real">Lucro Real</option>
                </select>
              </div>
            </div>
          </div>

          {/* Companies Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => {
              const companyCompetences = competences.filter(c => c.company === company.name && c.period === '02/2026');
              const currentStatus = companyCompetences[0]?.status || 'pending';
              const StatusIcon = competenceStatusConfig[currentStatus].icon;
              
              return (
                <div 
                  key={company.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{company.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{company.cnpj}</p>
                    </div>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Regime:</span>
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
                        {company.regime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Segmento:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{company.segment}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Honorário:</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(company.monthlyFee)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Status Fev/26:</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${competenceStatusConfig[currentStatus].color} flex items-center gap-1`}>
                        <StatusIcon className="w-3 h-3" />
                        {competenceStatusConfig[currentStatus].label}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Responsável: <span className="font-medium text-gray-900 dark:text-white">{company.responsible}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competences Tab */}
      {activeTab === 'competences' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar competências..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Todos os Períodos</option>
                  <option value="02/2026">Fevereiro/2026</option>
                  <option value="01/2026">Janeiro/2026</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">Pendente</option>
                  <option value="in-progress">Em Andamento</option>
                  <option value="review">Em Revisão</option>
                  <option value="closed">Fechado</option>
                  <option value="late">Atrasado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Competences Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Empresa</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Período</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Lançamentos</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Documentos</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Prazo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Responsável</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompetences.map((comp) => {
                    const StatusIcon = competenceStatusConfig[comp.status].icon;
                    return (
                      <tr
                        key={comp.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900 dark:text-white">{comp.company}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{comp.period}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{comp.entries}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{comp.documents}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(comp.dueDate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${competenceStatusConfig[comp.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {competenceStatusConfig[comp.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{comp.responsible}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                              <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>
                            {comp.status === 'closed' && (
                              <button className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors">
                                <Download className="w-4 h-4 text-green-600 dark:text-green-400" />
                              </button>
                            )}
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
      )}

      {/* Entries Tab */}
      {activeTab === 'entries' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Empresa</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Conta</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Débito</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Crédito</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Documento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const TypeIcon = entryTypeConfig[entry.type].icon;
                    return (
                      <tr
                        key={entry.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(entry.date)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{entry.company}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{entry.period}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${entryTypeConfig[entry.type].color} flex items-center gap-1 w-fit`}>
                            <TypeIcon className="w-3 h-3" />
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-mono">{entry.account}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white max-w-xs truncate">{entry.description}</p>
                        </td>
                        <td className="px-6 py-4">
                          {entry.debit > 0 ? (
                            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(entry.debit)}</p>
                          ) : (
                            <p className="text-sm text-gray-400">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {entry.credit > 0 ? (
                            <p className="text-sm font-semibold text-green-600 dark:text-green-400">{formatCurrency(entry.credit)}</p>
                          ) : (
                            <p className="text-sm text-gray-400">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{entry.document || '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                              <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>
                            <button className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors">
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
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => {
              const TypeIcon = reportTypeConfig[report.type].icon;
              const StatusIcon = reportStatusConfig[report.status].icon;
              
              return (
                <div 
                  key={report.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-lg ${reportTypeConfig[report.type].color.replace('text', 'bg').replace('dark:text', 'dark:bg')} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{report.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{report.company}</p>
                    </div>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Tipo:</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${reportTypeConfig[report.type].color} flex items-center gap-1`}>
                        <TypeIcon className="w-3 h-3" />
                        {report.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Período:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{report.period}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Gerado em:</span>
                      <span className="text-sm text-gray-900 dark:text-white">{formatDate(report.generatedDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${reportStatusConfig[report.status].color} flex items-center gap-1`}>
                      <StatusIcon className="w-3 h-3" />
                      {reportStatusConfig[report.status].label}
                    </span>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                        <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      </button>
                      <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                        <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

