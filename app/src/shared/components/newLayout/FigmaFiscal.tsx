import { useState } from 'react';
import { 
  FileText,
  Plus,
  Search,
  Filter,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  DollarSign,
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
  Calculator,
  FileDown,
  RefreshCw,
  Settings,
  Archive,
  TrendingDown,
  CircleDot,
  ListChecks,
  Percent
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
}

interface TaxAssessment {
  id: string;
  company: string;
  period: string;
  type: 'ISS' | 'ICMS' | 'PIS' | 'COFINS' | 'IRPJ' | 'CSLL' | 'Simples Nacional';
  revenue: number;
  calculatedTax: number;
  dueDate: string;
  status: 'pending' | 'calculated' | 'paid' | 'overdue';
  aliquot?: number;
}

interface FiscalDebt {
  id: string;
  company: string;
  cnpj: string;
  type: 'ICMS' | 'ISS' | 'PIS' | 'COFINS' | 'IRPJ' | 'CSLL' | 'Outros';
  amount: number;
  competence: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'negotiated';
  reference: string;
  penalty?: number;
  interest?: number;
}

interface Obligation {
  id: string;
  name: string;
  type: 'Declaração' | 'Apuração' | 'Pagamento' | 'Escrituração';
  company: string;
  period: string;
  dueDate: string;
  status: 'pending' | 'in-progress' | 'completed' | 'late';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string;
}

export function FigmaFiscal() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'companies' | 'assessments' | 'debts' | 'obligations'>('dashboard');
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
      status: 'active'
    },
    {
      id: '2',
      name: 'Comércio Beta S/A',
      cnpj: '98.765.432/0001-10',
      regime: 'Lucro Presumido',
      segment: 'Comércio',
      responsible: 'Carlos Oliveira',
      status: 'active'
    },
    {
      id: '3',
      name: 'Serviços Gamma Ltda',
      cnpj: '11.222.333/0001-44',
      regime: 'Simples Nacional',
      segment: 'Serviços',
      responsible: 'Ana Costa',
      status: 'active'
    },
    {
      id: '4',
      name: 'Indústria Delta S/A',
      cnpj: '55.666.777/0001-88',
      regime: 'Lucro Real',
      segment: 'Indústria',
      responsible: 'Maria Santos',
      status: 'active'
    },
  ];

  const assessments: TaxAssessment[] = [
    {
      id: '1',
      company: 'Tech Solutions Ltda',
      period: '02/2026',
      type: 'Simples Nacional',
      revenue: 145000,
      calculatedTax: 8850,
      aliquot: 6.1,
      dueDate: '2026-03-20',
      status: 'calculated'
    },
    {
      id: '2',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      type: 'ICMS',
      revenue: 280000,
      calculatedTax: 50400,
      aliquot: 18,
      dueDate: '2026-03-15',
      status: 'paid'
    },
    {
      id: '3',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      type: 'PIS',
      revenue: 280000,
      calculatedTax: 1820,
      aliquot: 0.65,
      dueDate: '2026-03-25',
      status: 'pending'
    },
    {
      id: '4',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      type: 'COFINS',
      revenue: 280000,
      calculatedTax: 8400,
      aliquot: 3.0,
      dueDate: '2026-03-25',
      status: 'pending'
    },
    {
      id: '5',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      type: 'IRPJ',
      revenue: 850000,
      calculatedTax: 127500,
      aliquot: 15,
      dueDate: '2026-03-31',
      status: 'calculated'
    },
    {
      id: '6',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      type: 'CSLL',
      revenue: 850000,
      calculatedTax: 76500,
      aliquot: 9,
      dueDate: '2026-03-31',
      status: 'calculated'
    },
    {
      id: '7',
      company: 'Serviços Gamma Ltda',
      period: '02/2026',
      type: 'ISS',
      revenue: 95000,
      calculatedTax: 4750,
      aliquot: 5,
      dueDate: '2026-03-10',
      status: 'overdue'
    },
    {
      id: '8',
      company: 'Tech Solutions Ltda',
      period: '01/2026',
      type: 'Simples Nacional',
      revenue: 138000,
      calculatedTax: 8418,
      aliquot: 6.1,
      dueDate: '2026-02-20',
      status: 'paid'
    },
  ];

  const debts: FiscalDebt[] = [
    {
      id: '1',
      company: 'Tech Solutions Ltda',
      cnpj: '12.345.678/0001-90',
      type: 'ICMS',
      amount: 12500,
      penalty: 625,
      interest: 450,
      competence: '12/2025',
      dueDate: '2026-01-15',
      status: 'overdue',
      reference: 'DARE - Dezembro/2025'
    },
    {
      id: '2',
      company: 'Comércio Beta S/A',
      cnpj: '98.765.432/0001-10',
      type: 'PIS',
      amount: 3200,
      penalty: 160,
      interest: 95,
      competence: '01/2026',
      dueDate: '2026-02-25',
      status: 'overdue',
      reference: 'DARF - Janeiro/2026'
    },
    {
      id: '3',
      company: 'Indústria Delta S/A',
      cnpj: '55.666.777/0001-88',
      type: 'IRPJ',
      amount: 85000,
      competence: '01/2026',
      dueDate: '2026-02-28',
      status: 'paid',
      reference: 'DARF - Janeiro/2026'
    },
    {
      id: '4',
      company: 'Serviços Gamma Ltda',
      cnpj: '11.222.333/0001-44',
      type: 'ISS',
      amount: 4200,
      penalty: 210,
      interest: 85,
      competence: '11/2025',
      dueDate: '2025-12-10',
      status: 'negotiated',
      reference: 'ISS - Novembro/2025'
    },
  ];

  const obligations: Obligation[] = [
    {
      id: '1',
      name: 'DCTF-Web - Declaração Mensal',
      type: 'Declaração',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      dueDate: '2026-03-15',
      status: 'in-progress',
      priority: 'high',
      assignee: 'Carlos Oliveira'
    },
    {
      id: '2',
      name: 'EFD-ICMS/IPI - Escrituração',
      type: 'Escrituração',
      company: 'Indústria Delta S/A',
      period: '02/2026',
      dueDate: '2026-03-20',
      status: 'pending',
      priority: 'urgent',
      assignee: 'Maria Santos'
    },
    {
      id: '3',
      name: 'Apuração Simples Nacional',
      type: 'Apuração',
      company: 'Tech Solutions Ltda',
      period: '02/2026',
      dueDate: '2026-03-18',
      status: 'completed',
      priority: 'medium',
      assignee: 'Ana Costa'
    },
    {
      id: '4',
      name: 'Pagamento DAS - Simples',
      type: 'Pagamento',
      company: 'Serviços Gamma Ltda',
      period: '02/2026',
      dueDate: '2026-03-20',
      status: 'pending',
      priority: 'high',
      assignee: 'Ana Costa'
    },
    {
      id: '5',
      name: 'EFD-Contribuições',
      type: 'Escrituração',
      company: 'Comércio Beta S/A',
      period: '02/2026',
      dueDate: '2026-03-10',
      status: 'late',
      priority: 'urgent',
      assignee: 'Carlos Oliveira'
    },
  ];

  const assessmentStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Clock },
    calculated: { label: 'Apurado', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Calculator },
    paid: { label: 'Pago', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    overdue: { label: 'Vencido', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertTriangle },
  };

  const debtStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Clock },
    paid: { label: 'Pago', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    overdue: { label: 'Vencido', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertTriangle },
    negotiated: { label: 'Parcelado', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: ListChecks },
  };

  const obligationTypeConfig = {
    'Declaração': { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: FileText },
    'Apuração': { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', icon: Calculator },
    'Pagamento': { color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: DollarSign },
    'Escrituração': { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: FileCheck },
  };

  const obligationStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Clock },
    'in-progress': { label: 'Em Andamento', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: RefreshCw },
    completed: { label: 'Concluída', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    late: { label: 'Atrasada', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertCircle },
  };

  const priorityConfig = {
    low: { label: 'Baixa', color: 'text-gray-600 dark:text-gray-400' },
    medium: { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400' },
    high: { label: 'Alta', color: 'text-orange-600 dark:text-orange-400' },
    urgent: { label: 'Urgente', color: 'text-red-600 dark:text-red-400' },
  };

  // Stats
  const totalCompanies = companies.filter(c => c.status === 'active').length;
  const pendingObligations = obligations.filter(o => o.status !== 'completed').length;
  const totalTaxes = assessments.reduce((sum, a) => sum + a.calculatedTax, 0);
  const overdueDebts = debts.filter(d => d.status === 'overdue').length;
  const overdueAssessments = assessments.filter(a => a.status === 'overdue').length;

  // Tax distribution by type
  const taxTypeData = [
    { name: 'Simples', value: assessments.filter(a => a.type === 'Simples Nacional').reduce((s, a) => s + a.calculatedTax, 0), color: '#3b82f6' },
    { name: 'ICMS', value: assessments.filter(a => a.type === 'ICMS').reduce((s, a) => s + a.calculatedTax, 0), color: '#10b981' },
    { name: 'IRPJ', value: assessments.filter(a => a.type === 'IRPJ').reduce((s, a) => s + a.calculatedTax, 0), color: '#f59e0b' },
    { name: 'CSLL', value: assessments.filter(a => a.type === 'CSLL').reduce((s, a) => s + a.calculatedTax, 0), color: '#ef4444' },
    { name: 'PIS/COFINS', value: assessments.filter(a => a.type === 'PIS' || a.type === 'COFINS').reduce((s, a) => s + a.calculatedTax, 0), color: '#8b5cf6' },
    { name: 'ISS', value: assessments.filter(a => a.type === 'ISS').reduce((s, a) => s + a.calculatedTax, 0), color: '#ec4899' },
  ].filter(item => item.value > 0);

  // Monthly revenue and taxes (last 6 months)
  const monthlyData = [
    { month: 'Out', revenue: 1200, taxes: 145 },
    { month: 'Nov', revenue: 1350, taxes: 162 },
    { month: 'Dez', revenue: 1450, taxes: 174 },
    { month: 'Jan', revenue: 1380, taxes: 165 },
    { month: 'Fev', revenue: 1510, taxes: 181 },
    { month: 'Mar', revenue: 1420, taxes: 170 },
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

  const filteredAssessments = assessments.filter(assessment => {
    const matchesSearch = assessment.company.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPeriod = filterPeriod === 'all' || assessment.period === filterPeriod;
    const matchesStatus = filterStatus === 'all' || assessment.status === filterStatus;
    return matchesSearch && matchesPeriod && matchesStatus;
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            Departamento Fiscal
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de obrigações fiscais, apurações e débitos tributários
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <Upload className="w-5 h-5" />
            <span className="font-medium">Importar e-CAC</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded-lg hover:from-cyan-700 hover:to-cyan-800 transition-all shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Nova Apuração</span>
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
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
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
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Building2 className="w-4 h-4 inline-block mr-2" />
            Empresas
          </button>
          <button
            onClick={() => setActiveTab('assessments')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'assessments'
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Calculator className="w-4 h-4 inline-block mr-2" />
            Apurações
            {overdueAssessments > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {overdueAssessments}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'debts'
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline-block mr-2" />
            Débitos
            {overdueDebts > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {overdueDebts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('obligations')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'obligations'
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4 inline-block mr-2" />
            Obrigações
            {pendingObligations > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                {pendingObligations}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Empresas Ativas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalCompanies}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Impostos Apurados</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalTaxes)}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Obrigações Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingObligations}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                  <CheckSquare className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Débitos Vencidos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{overdueDebts}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-md">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue vs Taxes */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Faturamento vs Impostos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Últimos 6 meses (em milhares)</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthlyData}>
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
                    formatter={(value: number) => `R$ ${value}k`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name="Faturamento" stroke="#06b6d4" strokeWidth={2} />
                  <Line type="monotone" dataKey="taxes" name="Impostos" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tax Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Distribuição de Impostos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Por tipo de tributo</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={taxTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {taxTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {taxTypeData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Alerts and Recent Assessments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Critical Alerts */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Alertas Críticos
                </h3>
              </div>
              <div className="space-y-3">
                {/* Overdue Debts */}
                {debts.filter(d => d.status === 'overdue').slice(0, 3).map((debt) => (
                  <div key={debt.id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {debt.type} Vencido - {debt.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {formatCurrency(debt.amount)} - Vencimento: {formatDate(debt.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Overdue Assessments */}
                {assessments.filter(a => a.status === 'overdue').map((assessment) => (
                  <div key={assessment.id} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {assessment.type} - {assessment.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {formatCurrency(assessment.calculatedTax)} - Período: {assessment.period}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Late Obligations */}
                {obligations.filter(o => o.status === 'late').map((obligation) => (
                  <div key={obligation.id} className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {obligation.name} - {obligation.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Vencimento: {formatDate(obligation.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Assessments */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  Apurações Recentes
                </h3>
                <button 
                  onClick={() => setActiveTab('assessments')}
                  className="text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3">
                {assessments.filter(a => a.period === '02/2026').slice(0, 5).map((assessment) => {
                  const StatusIcon = assessmentStatusConfig[assessment.status].icon;
                  return (
                    <div key={assessment.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{assessment.company}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {assessment.type} - {assessment.period}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${assessmentStatusConfig[assessment.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {assessmentStatusConfig[assessment.status].label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">
                          Alíquota: {assessment.aliquot}%
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(assessment.calculatedTax)}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterRegime}
                  onChange={(e) => setFilterRegime(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
              const companyAssessments = assessments.filter(a => a.company === company.name);
              const totalTax = companyAssessments.reduce((sum, a) => sum + a.calculatedTax, 0);
              
              return (
                <div 
                  key={company.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-cyan-300 dark:hover:border-cyan-600 transition-all cursor-pointer"
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
                      <span className="text-sm text-gray-600 dark:text-gray-400">Impostos (Fev):</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(totalTax)}</span>
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

      {/* Assessments Tab */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar apurações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="all">Todos os Períodos</option>
                  <option value="02/2026">Fevereiro/2026</option>
                  <option value="01/2026">Janeiro/2026</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">Pendente</option>
                  <option value="calculated">Apurado</option>
                  <option value="paid">Pago</option>
                  <option value="overdue">Vencido</option>
                </select>
              </div>
            </div>
          </div>

          {/* Assessments Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Empresa</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Período</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Faturamento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Alíquota</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Imposto</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Vencimento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredAssessments.map((assessment) => {
                    const StatusIcon = assessmentStatusConfig[assessment.status].icon;
                    return (
                      <tr key={assessment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900 dark:text-white">{assessment.company}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{assessment.period}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            assessment.type === 'Simples Nacional' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            assessment.type === 'ICMS' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            assessment.type === 'ISS' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300' :
                            assessment.type === 'IRPJ' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                            assessment.type === 'CSLL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          }`}>
                            {assessment.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(assessment.revenue)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                            <Percent className="w-3 h-3" />
                            {assessment.aliquot}%
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(assessment.calculatedTax)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(assessment.dueDate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${assessmentStatusConfig[assessment.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {assessmentStatusConfig[assessment.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </button>
                            {assessment.status !== 'paid' && (
                              <button className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors">
                                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
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

      {/* Debts Tab */}
      {activeTab === 'debts' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Empresa</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Competência</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Valor Principal</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Multa/Juros</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Vencimento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {debts.map((debt) => {
                    const StatusIcon = debtStatusConfig[debt.status].icon;
                    const total = debt.amount + (debt.penalty || 0) + (debt.interest || 0);
                    
                    return (
                      <tr key={debt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{debt.company}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{debt.cnpj}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            debt.type === 'ICMS' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            debt.type === 'ISS' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300' :
                            debt.type === 'PIS' || debt.type === 'COFINS' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                            debt.type === 'IRPJ' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                            debt.type === 'CSLL' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {debt.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{debt.competence}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(debt.amount)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {(debt.penalty || debt.interest) ? (
                            <p className="text-sm text-red-600 dark:text-red-400">
                              {formatCurrency((debt.penalty || 0) + (debt.interest || 0))}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(total)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(debt.dueDate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${debtStatusConfig[debt.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {debtStatusConfig[debt.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {debt.status !== 'paid' ? (
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                              </button>
                              <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                                <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              </button>
                            </div>
                          ) : (
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </button>
                          )}
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

      {/* Obligations Tab */}
      {activeTab === 'obligations' && (
        <div className="space-y-6">
          <div className="space-y-4">
            {obligations.map((obligation) => {
              const TypeIcon = obligationTypeConfig[obligation.type].icon;
              const StatusIcon = obligationStatusConfig[obligation.status].icon;
              
              return (
                <div 
                  key={obligation.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg ${obligationTypeConfig[obligation.type].color.replace('text', 'bg').replace('dark:text', 'dark:bg')} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{obligation.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{obligation.company} • Período: {obligation.period}</p>
                        </div>
                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${obligationTypeConfig[obligation.type].color} flex items-center gap-1`}>
                          <TypeIcon className="w-3 h-3" />
                          {obligation.type}
                        </span>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${obligationStatusConfig[obligation.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {obligationStatusConfig[obligation.status].label}
                        </span>

                        <span className={`px-2.5 py-1 rounded text-xs font-medium ${priorityConfig[obligation.priority].color}`}>
                          {priorityConfig[obligation.priority].label}
                        </span>

                        <span className="px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Vencimento: {formatDate(obligation.dueDate)}
                        </span>

                        <span className="px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400">
                          Responsável: {obligation.assignee}
                        </span>
                      </div>
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

