import { useState } from 'react';
import { 
  CreditCard,
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  PlayCircle,
  PauseCircle,
  FileText,
  Calendar,
  User,
  Building2,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Activity,
  Send,
  ArrowRight,
  AlertTriangle,
  CheckSquare,
  Users,
  Package,
  Zap,
  RefreshCw,
  Target,
  List,
  Grid,
  MoreVertical,
  Upload,
  FilePlus,
  DollarSign,
  Percent,
  Hash,
  ShieldCheck,
  FileCheck,
  Ban,
  Receipt,
  Coins,
  Wallet,
  TrendingDown,
  Archive,
  Bell
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Certificate {
  id: string;
  clientName: string;
  cnpj: string;
  type: 'Municipal' | 'Estadual' | 'Federal' | 'FGTS' | 'Trabalhista';
  status: 'valid' | 'expired' | 'issuing' | 'pending';
  issueDate?: string;
  expiryDate?: string;
  pdfUrl?: string;
  observations?: string;
  issuer?: string;
}

interface Debt {
  id: string;
  clientName: string;
  cnpj: string;
  type: 'ICMS' | 'ISS' | 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'FGTS' | 'INSS' | 'Outros';
  totalAmount: number;
  status: 'active' | 'paid' | 'cancelled' | 'overdue';
  identifiedDate: string;
  responsible?: string;
  observations?: string;
}

interface Installment {
  id: string;
  clientName: string;
  cnpj: string;
  processNumber: string;
  debtType: 'ICMS' | 'ISS' | 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'FGTS' | 'INSS' | 'Outros';
  totalAmount: number;
  installmentCount: number;
  paidInstallments: number;
  installmentValue: number;
  firstDueDate: string;
  nextDueDate?: string;
  lastPaymentDate?: string;
  status: 'active' | 'paid' | 'cancelled' | 'overdue';
  createdAt: string;
  responsible?: string;
  observations?: string;
}

interface Reminder {
  id: string;
  title: string;
  description: string;
  type: 'certificate' | 'installment' | 'debt' | 'other';
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
  relatedClient?: string;
  createdAt: string;
}

export function FigmaParcelamento() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'certificates' | 'debts' | 'installments' | 'reminders'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const certificates: Certificate[] = [
    {
      id: '1',
      clientName: 'Alpha Comércio Ltda',
      cnpj: '12.345.678/0001-90',
      type: 'Federal',
      status: 'valid',
      issueDate: '2026-03-10',
      expiryDate: '2026-09-10',
      pdfUrl: '/certificates/cnd-federal-alpha.pdf',
      issuer: 'Receita Federal'
    },
    {
      id: '2',
      clientName: 'Beta Indústria S/A',
      cnpj: '98.765.432/0001-10',
      type: 'Estadual',
      status: 'expired',
      issueDate: '2025-09-15',
      expiryDate: '2026-03-15',
      issuer: 'SEFAZ-BA'
    },
    {
      id: '3',
      clientName: 'Gamma Serviços ME',
      cnpj: '45.678.901/0001-23',
      type: 'Municipal',
      status: 'issuing',
      issuer: 'Prefeitura de Feira de Santana'
    },
    {
      id: '4',
      clientName: 'Delta Logística Ltda',
      cnpj: '78.901.234/0001-56',
      type: 'FGTS',
      status: 'pending',
      observations: 'Aguardando regularização de débitos',
      issuer: 'Caixa Econômica Federal'
    },
    {
      id: '5',
      clientName: 'Epsilon Tech EIRELI',
      cnpj: '23.456.789/0001-89',
      type: 'Trabalhista',
      status: 'valid',
      issueDate: '2026-02-20',
      expiryDate: '2026-08-20',
      pdfUrl: '/certificates/cnd-trabalhista-epsilon.pdf',
      issuer: 'Justiça do Trabalho'
    },
  ];

  const debts: Debt[] = [
    {
      id: '1',
      clientName: 'Beta Indústria S/A',
      cnpj: '98.765.432/0001-10',
      type: 'ICMS',
      totalAmount: 45800.50,
      status: 'active',
      identifiedDate: '2026-03-05',
      responsible: 'João Parcelamento',
      observations: 'Débito de competências 10-12/2025'
    },
    {
      id: '2',
      clientName: 'Gamma Serviços ME',
      cnpj: '45.678.901/0001-23',
      type: 'ISS',
      totalAmount: 8500.00,
      status: 'active',
      identifiedDate: '2026-03-12',
      responsible: 'Maria Parcelamento'
    },
    {
      id: '3',
      clientName: 'Delta Logística Ltda',
      cnpj: '78.901.234/0001-56',
      type: 'FGTS',
      totalAmount: 12300.75,
      status: 'active',
      identifiedDate: '2026-03-08',
      responsible: 'João Parcelamento',
      observations: 'Parcelamento em negociação'
    },
    {
      id: '4',
      clientName: 'Zeta Restaurante Ltda',
      cnpj: '34.567.890/0001-12',
      type: 'INSS',
      totalAmount: 15600.00,
      status: 'paid',
      identifiedDate: '2026-02-10',
      responsible: 'Maria Parcelamento'
    },
  ];

  const installments: Installment[] = [
    {
      id: '1',
      clientName: 'Beta Indústria S/A',
      cnpj: '98.765.432/0001-10',
      processNumber: 'ICMS-2026-00145',
      debtType: 'ICMS',
      totalAmount: 45800.50,
      installmentCount: 12,
      paidInstallments: 2,
      installmentValue: 3816.71,
      firstDueDate: '2026-02-10',
      nextDueDate: '2026-04-10',
      lastPaymentDate: '2026-03-10',
      status: 'active',
      createdAt: '2026-01-25',
      responsible: 'João Parcelamento'
    },
    {
      id: '2',
      clientName: 'Gamma Serviços ME',
      cnpj: '45.678.901/0001-23',
      processNumber: 'ISS-2026-00089',
      debtType: 'ISS',
      totalAmount: 8500.00,
      installmentCount: 6,
      paidInstallments: 0,
      installmentValue: 1416.67,
      firstDueDate: '2026-03-20',
      nextDueDate: '2026-03-20',
      status: 'active',
      createdAt: '2026-03-10',
      responsible: 'Maria Parcelamento'
    },
    {
      id: '3',
      clientName: 'Delta Logística Ltda',
      cnpj: '78.901.234/0001-56',
      processNumber: 'FGTS-2026-00234',
      debtType: 'FGTS',
      totalAmount: 12300.75,
      installmentCount: 10,
      paidInstallments: 1,
      installmentValue: 1230.08,
      firstDueDate: '2026-02-25',
      nextDueDate: '2026-04-25',
      lastPaymentDate: '2026-03-15',
      status: 'overdue',
      createdAt: '2026-02-10',
      responsible: 'João Parcelamento',
      observations: 'Parcela de março em atraso'
    },
    {
      id: '4',
      clientName: 'Zeta Restaurante Ltda',
      cnpj: '34.567.890/0001-12',
      processNumber: 'INSS-2025-00567',
      debtType: 'INSS',
      totalAmount: 15600.00,
      installmentCount: 8,
      paidInstallments: 8,
      installmentValue: 1950.00,
      firstDueDate: '2025-08-15',
      lastPaymentDate: '2026-03-15',
      status: 'paid',
      createdAt: '2025-07-20',
      responsible: 'Maria Parcelamento'
    },
  ];

  const reminders: Reminder[] = [
    {
      id: '1',
      title: 'Vencimento Certidão Federal - Alpha',
      description: 'Certidão Federal vence em 10/09/2026',
      type: 'certificate',
      dueDate: '2026-09-10',
      priority: 'medium',
      status: 'pending',
      relatedClient: 'Alpha Comércio Ltda',
      createdAt: '2026-03-10'
    },
    {
      id: '2',
      title: 'Parcela Parcelamento ICMS - Beta',
      description: 'Próxima parcela vence em 10/04/2026',
      type: 'installment',
      dueDate: '2026-04-10',
      priority: 'high',
      status: 'pending',
      relatedClient: 'Beta Indústria S/A',
      createdAt: '2026-03-15'
    },
    {
      id: '3',
      title: 'Regularizar FGTS - Delta',
      description: 'Parcela de março em atraso, regularizar urgente',
      type: 'installment',
      dueDate: '2026-03-18',
      priority: 'high',
      status: 'pending',
      relatedClient: 'Delta Logística Ltda',
      createdAt: '2026-03-16'
    },
  ];

  const statusConfig = {
    valid: { label: 'Válida', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    expired: { label: 'Vencida', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
    issuing: { label: 'Em Emissão', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Clock },
    pending: { label: 'Pendente', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: AlertCircle },
    active: { label: 'Ativo', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: PlayCircle },
    paid: { label: 'Quitado', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    cancelled: { label: 'Cancelado', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Ban },
    overdue: { label: 'Em Atraso', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertTriangle },
  };

  const priorityConfig = {
    low: { label: 'Baixa', color: 'text-gray-600 dark:text-gray-400' },
    medium: { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400' },
    high: { label: 'Alta', color: 'text-red-600 dark:text-red-400' },
  };

  // Stats
  const totalCertificates = certificates.length;
  const validCertificates = certificates.filter(c => c.status === 'valid').length;
  const expiredCertificates = certificates.filter(c => c.status === 'expired').length;
  const issuingCertificates = certificates.filter(c => c.status === 'issuing').length;

  const totalDebts = debts.length;
  const activeDebts = debts.filter(d => d.status === 'active').length;
  const totalDebtAmount = debts.filter(d => d.status === 'active').reduce((sum, d) => sum + d.totalAmount, 0);

  const totalInstallments = installments.length;
  const activeInstallments = installments.filter(i => i.status === 'active').length;
  const overdueInstallments = installments.filter(i => i.status === 'overdue').length;
  const paidInstallments = installments.filter(i => i.status === 'paid').length;

  const pendingReminders = reminders.filter(r => r.status === 'pending').length;

  // Certificate distribution
  const certificateTypes = [
    { name: 'Federal', value: certificates.filter(c => c.type === 'Federal').length, color: '#3b82f6' },
    { name: 'Estadual', value: certificates.filter(c => c.type === 'Estadual').length, color: '#10b981' },
    { name: 'Municipal', value: certificates.filter(c => c.type === 'Municipal').length, color: '#f59e0b' },
    { name: 'FGTS', value: certificates.filter(c => c.type === 'FGTS').length, color: '#8b5cf6' },
    { name: 'Trabalhista', value: certificates.filter(c => c.type === 'Trabalhista').length, color: '#ec4899' },
  ].filter(item => item.value > 0);

  // Installment trend (last 6 months)
  const installmentTrend = [
    { month: 'Out', paid: 8, overdue: 1 },
    { month: 'Nov', paid: 10, overdue: 0 },
    { month: 'Dez', paid: 9, overdue: 2 },
    { month: 'Jan', paid: 11, overdue: 1 },
    { month: 'Fev', paid: 12, overdue: 0 },
    { month: 'Mar', paid: 10, overdue: 1 },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            Departamento de Parcelamento
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de certidões, débitos e parcelamentos fiscais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <Download className="w-5 h-5" />
            <span className="font-medium">Exportar Relatório</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Parcelamento</span>
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
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('certificates')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'certificates'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4 inline-block mr-2" />
            Certidões
            {expiredCertificates > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {expiredCertificates}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'debts'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Receipt className="w-4 h-4 inline-block mr-2" />
            Débitos
            {activeDebts > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white rounded-full text-xs">
                {activeDebts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('installments')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'installments'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Wallet className="w-4 h-4 inline-block mr-2" />
            Parcelamentos
            {overdueInstallments > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {overdueInstallments}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'reminders'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Bell className="w-4 h-4 inline-block mr-2" />
            Lembretes
            {pendingReminders > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                {pendingReminders}
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Certidões Válidas</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{validCertificates}</p>
                  {expiredCertificates > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {expiredCertificates} vencidas
                    </p>
                  )}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Débitos Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeDebts}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatCurrency(totalDebtAmount)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-md">
                  <Receipt className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Parcelamentos Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeInstallments}</p>
                  {overdueInstallments > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {overdueInstallments} em atraso
                    </p>
                  )}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Lembretes Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingReminders}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    próximos vencimentos
                  </p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Bell className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Installment Trend */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Parcelas - Últimos 6 Meses
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Pagas vs Em Atraso</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={installmentTrend}>
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
                  <Legend />
                  <Bar dataKey="paid" name="Pagas" fill="#10b981" />
                  <Bar dataKey="overdue" name="Em Atraso" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Certificate Types */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Certidões por Tipo
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Distribuição atual</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={certificateTypes}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {certificateTypes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {certificateTypes.map((item, index) => (
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

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Expiring Certificates */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Certidões Vencidas/Pendentes
                </h3>
                <button 
                  onClick={() => setActiveTab('certificates')}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3">
                {certificates.filter(c => c.status === 'expired' || c.status === 'pending').map((cert) => {
                  const StatusIcon = statusConfig[cert.status].icon;
                  return (
                    <div key={cert.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{cert.clientName}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{cert.type}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[cert.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[cert.status].label}
                        </span>
                      </div>
                      {cert.expiryDate && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Vencimento: {formatDate(cert.expiryDate)}
                        </p>
                      )}
                      {cert.observations && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 italic mt-1">
                          {cert.observations}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overdue Installments */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  Parcelamentos em Atraso
                </h3>
                <button 
                  onClick={() => setActiveTab('installments')}
                  className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                >
                  Ver todos
                </button>
              </div>
              <div className="space-y-3">
                {installments.filter(i => i.status === 'overdue').map((inst) => (
                  <div key={inst.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-red-200 dark:border-red-800">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{inst.clientName}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{inst.processNumber}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Em Atraso
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">
                        Próxima: {inst.nextDueDate && formatDate(inst.nextDueDate)}
                      </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(inst.installmentValue)}
                      </span>
                    </div>
                    {inst.observations && (
                      <p className="text-xs text-red-600 dark:text-red-400 italic mt-2">
                        {inst.observations}
                      </p>
                    )}
                  </div>
                ))}
                {installments.filter(i => i.status === 'overdue').length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Nenhum parcelamento em atraso
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {certificates.map((cert) => {
              const StatusIcon = statusConfig[cert.status].icon;
              
              return (
                <div 
                  key={cert.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl border p-6 hover:shadow-lg transition-all cursor-pointer ${
                    cert.status === 'expired' ? 'border-red-300 dark:border-red-600' :
                    'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{cert.clientName}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{cert.cnpj}</p>
                    </div>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Tipo:</span>
                      <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                        {cert.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[cert.status].color} flex items-center gap-1`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig[cert.status].label}
                      </span>
                    </div>
                    {cert.issueDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Emissão:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{formatDate(cert.issueDate)}</span>
                      </div>
                    )}
                    {cert.expiryDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Validade:</span>
                        <span className={`text-sm font-medium ${cert.status === 'expired' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                          {formatDate(cert.expiryDate)}
                        </span>
                      </div>
                    )}
                    {cert.issuer && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Emissor:</span>
                        <span className="text-sm text-gray-900 dark:text-white">{cert.issuer}</span>
                      </div>
                    )}
                  </div>

                  {cert.observations && (
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mb-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                        {cert.observations}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {cert.pdfUrl && (
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg text-sm font-medium text-purple-700 dark:text-purple-300 transition-colors">
                        <Download className="w-4 h-4" />
                        Download PDF
                      </button>
                    )}
                    <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors">
                      <Eye className="w-4 h-4" />
                      Detalhes
                    </button>
                  </div>
                </div>
              );
            })}
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Cliente</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo de Débito</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Valor Total</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Data Identificação</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Responsável</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {debts.map((debt) => {
                    const StatusIcon = statusConfig[debt.status].icon;
                    return (
                      <tr key={debt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{debt.clientName}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{debt.cnpj}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium">
                            {debt.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(debt.totalAmount)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[debt.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[debt.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(debt.identifiedDate)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {debt.responsible ? (
                            <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {debt.responsible}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-md transition-colors">
                              <Edit className="w-4 h-4 text-purple-600 dark:text-purple-400" />
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

      {/* Installments Tab */}
      {activeTab === 'installments' && (
        <div className="space-y-6">
          <div className="space-y-4">
            {installments.map((inst) => {
              const StatusIcon = statusConfig[inst.status].icon;
              const progress = (inst.paidInstallments / inst.installmentCount) * 100;
              
              return (
                <div 
                  key={inst.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl border p-6 hover:shadow-md transition-all ${
                    inst.status === 'overdue' ? 'border-red-300 dark:border-red-600' :
                    'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg ${
                      inst.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                      inst.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    } flex items-center justify-center flex-shrink-0`}>
                      <Wallet className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{inst.clientName}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Processo: {inst.processNumber}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[inst.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig[inst.status].label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Tipo</p>
                          <span className="px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-medium">
                            {inst.debtType}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Valor Total</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(inst.totalAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Valor Parcela</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(inst.installmentValue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Próximo Vencimento</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {inst.nextDueDate ? formatDate(inst.nextDueDate) : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Responsável</p>
                          <p className="text-sm text-gray-900 dark:text-white">{inst.responsible}</p>
                        </div>
                      </div>

                      {/* Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            Progresso: {inst.paidInstallments} de {inst.installmentCount} parcelas
                          </span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              inst.status === 'paid' ? 'bg-green-500' :
                              inst.status === 'overdue' ? 'bg-red-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {inst.observations && (
                        <p className="text-xs text-red-600 dark:text-red-400 italic mt-3">
                          {inst.observations}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reminders Tab */}
      {activeTab === 'reminders' && (
        <div className="space-y-6">
          <div className="space-y-4">
            {reminders.map((reminder) => (
              <div 
                key={reminder.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg ${
                    reminder.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                    reminder.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  } flex items-center justify-center flex-shrink-0`}>
                    <Bell className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{reminder.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{reminder.description}</p>
                      </div>
                      <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                        <MoreVertical className="w-5 h-5 text-gray-400" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <span className={`font-medium ${priorityConfig[reminder.priority].color}`}>
                        {priorityConfig[reminder.priority].label}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(reminder.dueDate)}
                      </span>
                      {reminder.relatedClient && (
                        <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {reminder.relatedClient}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

