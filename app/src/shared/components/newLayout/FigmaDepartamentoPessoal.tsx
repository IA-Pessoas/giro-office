import { useState } from 'react';
import { 
  UserCog,
  Plus,
  Search,
  Filter,
  Building2,
  Users,
  FileText,
  Shield,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  TrendingUp,
  DollarSign,
  Download,
  Upload,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Key,
  AlertTriangle,
  CheckSquare,
  XCircle,
  BarChart3,
  PieChart as PieChartIcon,
  Bell,
  FileCheck,
  UserPlus,
  UserMinus,
  RefreshCw,
  Lock,
  Unlock,
  Copy,
  ExternalLink,
  Archive,
  Settings
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Company {
  id: string;
  name: string;
  cnpj: string;
  regime: 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real';
  group?: string;
  employees: number;
  status: 'active' | 'inactive' | 'suspended';
  payrollAmount: number;
  responsible: string;
  segment: string;
}

interface Certificate {
  id: string;
  type: 'PJ' | 'PF';
  company?: string;
  holder: string;
  cnpj?: string;
  cpf?: string;
  password: string;
  expiryDate: string;
  status: 'active' | 'expiring' | 'expired';
  accessLevel: 'admin' | 'leader' | 'team';
}

interface Debt {
  id: string;
  company: string;
  type: 'INSS' | 'FGTS' | 'IRRF' | 'ISS' | 'Outros';
  amount: number;
  competence: string;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  reference: string;
}

interface Task {
  id: string;
  title: string;
  type: 'admission' | 'termination' | 'payroll' | 'certificate' | 'obligation';
  company: string;
  dueDate: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: string;
}

export function FigmaDepartamentoPessoal() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'companies' | 'certificates' | 'debts' | 'tasks'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRegime, setFilterRegime] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});

  const companies: Company[] = [
    {
      id: '1',
      name: 'Tech Solutions Ltda',
      cnpj: '12.345.678/0001-90',
      regime: 'Simples Nacional',
      group: 'Grupo Alpha',
      employees: 45,
      status: 'active',
      payrollAmount: 185000,
      responsible: 'Ana Costa',
      segment: 'Tecnologia'
    },
    {
      id: '2',
      name: 'Comércio Beta S/A',
      cnpj: '98.765.432/0001-10',
      regime: 'Lucro Presumido',
      group: 'Grupo Alpha',
      employees: 28,
      status: 'active',
      payrollAmount: 98000,
      responsible: 'Carlos Oliveira',
      segment: 'Comércio'
    },
    {
      id: '3',
      name: 'Serviços Gamma Ltda',
      cnpj: '11.222.333/0001-44',
      regime: 'Simples Nacional',
      employees: 18,
      status: 'active',
      payrollAmount: 72000,
      responsible: 'Ana Costa',
      segment: 'Serviços'
    },
    {
      id: '4',
      name: 'Indústria Delta S/A',
      cnpj: '55.666.777/0001-88',
      regime: 'Lucro Real',
      group: 'Grupo Beta',
      employees: 120,
      status: 'active',
      payrollAmount: 520000,
      responsible: 'Maria Santos',
      segment: 'Indústria'
    },
    {
      id: '5',
      name: 'Consultoria Omega ME',
      cnpj: '99.888.777/0001-66',
      regime: 'Simples Nacional',
      employees: 8,
      status: 'suspended',
      payrollAmount: 32000,
      responsible: 'Ana Costa',
      segment: 'Consultoria'
    },
  ];

  const certificates: Certificate[] = [
    {
      id: '1',
      type: 'PJ',
      company: 'Tech Solutions Ltda',
      holder: 'Tech Solutions Ltda',
      cnpj: '12.345.678/0001-90',
      password: 'Cert@2024Tech#',
      expiryDate: '2026-08-15',
      status: 'active',
      accessLevel: 'admin'
    },
    {
      id: '2',
      type: 'PJ',
      company: 'Comércio Beta S/A',
      holder: 'Comércio Beta S/A',
      cnpj: '98.765.432/0001-10',
      password: 'Beta#Secure2024',
      expiryDate: '2026-04-20',
      status: 'expiring',
      accessLevel: 'leader'
    },
    {
      id: '3',
      type: 'PF',
      holder: 'João Silva - Sócio',
      cpf: '123.456.789-00',
      password: 'JoaoS@2024#',
      expiryDate: '2026-12-30',
      status: 'active',
      accessLevel: 'admin'
    },
    {
      id: '4',
      type: 'PJ',
      company: 'Indústria Delta S/A',
      holder: 'Indústria Delta S/A',
      cnpj: '55.666.777/0001-88',
      password: 'Delta!Ind2024',
      expiryDate: '2026-03-10',
      status: 'expiring',
      accessLevel: 'leader'
    },
    {
      id: '5',
      type: 'PF',
      holder: 'Maria Santos - Contadora',
      cpf: '987.654.321-00',
      password: 'MariaC@2024',
      expiryDate: '2025-12-25',
      status: 'expired',
      accessLevel: 'team'
    },
  ];

  const debts: Debt[] = [
    {
      id: '1',
      company: 'Tech Solutions Ltda',
      type: 'INSS',
      amount: 15420.50,
      competence: '02/2026',
      dueDate: '2026-03-20',
      status: 'pending',
      reference: 'GPS - Fevereiro/2026'
    },
    {
      id: '2',
      company: 'Comércio Beta S/A',
      type: 'FGTS',
      amount: 8950.00,
      competence: '02/2026',
      dueDate: '2026-03-07',
      status: 'overdue',
      reference: 'SEFIP - Fevereiro/2026'
    },
    {
      id: '3',
      company: 'Indústria Delta S/A',
      type: 'IRRF',
      amount: 42300.00,
      competence: '02/2026',
      dueDate: '2026-03-20',
      status: 'pending',
      reference: 'DARF - Folha Fevereiro'
    },
    {
      id: '4',
      company: 'Tech Solutions Ltda',
      type: 'FGTS',
      amount: 12200.00,
      competence: '01/2026',
      dueDate: '2026-02-07',
      status: 'paid',
      reference: 'SEFIP - Janeiro/2026'
    },
    {
      id: '5',
      company: 'Serviços Gamma Ltda',
      type: 'ISS',
      amount: 3850.00,
      competence: '02/2026',
      dueDate: '2026-03-15',
      status: 'pending',
      reference: 'ISS - Fevereiro/2026'
    },
  ];

  const tasks: Task[] = [
    {
      id: '1',
      title: 'Admissão de 3 novos colaboradores',
      type: 'admission',
      company: 'Tech Solutions Ltda',
      dueDate: '2026-03-20',
      status: 'in-progress',
      priority: 'high',
      assignee: 'Ana Costa'
    },
    {
      id: '2',
      title: 'Fechamento da Folha de Fevereiro',
      type: 'payroll',
      company: 'Todas as Empresas',
      dueDate: '2026-03-18',
      status: 'pending',
      priority: 'urgent',
      assignee: 'Carlos Oliveira'
    },
    {
      id: '3',
      title: 'Rescisão - João Ferreira',
      type: 'termination',
      company: 'Comércio Beta S/A',
      dueDate: '2026-03-25',
      status: 'pending',
      priority: 'medium',
      assignee: 'Ana Costa'
    },
    {
      id: '4',
      title: 'Renovação Certificado Digital PJ',
      type: 'certificate',
      company: 'Indústria Delta S/A',
      dueDate: '2026-03-10',
      status: 'pending',
      priority: 'urgent',
      assignee: 'Maria Santos'
    },
    {
      id: '5',
      title: 'Envio eSocial - Eventos Periódicos',
      type: 'obligation',
      company: 'Todas as Empresas',
      dueDate: '2026-03-15',
      status: 'completed',
      priority: 'high',
      assignee: 'Carlos Oliveira'
    },
  ];

  const statusConfig = {
    active: { label: 'Ativa', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    inactive: { label: 'Inativa', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: XCircle },
    suspended: { label: 'Suspensa', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: AlertCircle },
  };

  const certificateStatusConfig = {
    active: { label: 'Válido', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    expiring: { label: 'Vence em Breve', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: AlertTriangle },
    expired: { label: 'Expirado', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
  };

  const debtStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Clock },
    paid: { label: 'Pago', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    overdue: { label: 'Vencido', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertTriangle },
  };

  const taskTypeConfig = {
    admission: { label: 'Admissão', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: UserPlus },
    termination: { label: 'Desligamento', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: UserMinus },
    payroll: { label: 'Folha', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: DollarSign },
    certificate: { label: 'Certificado', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', icon: Shield },
    obligation: { label: 'Obrigação', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: FileCheck },
  };

  const taskStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: Clock },
    'in-progress': { label: 'Em Andamento', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: RefreshCw },
    completed: { label: 'Concluída', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
  };

  const priorityConfig = {
    low: { label: 'Baixa', color: 'text-gray-600 dark:text-gray-400' },
    medium: { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400' },
    high: { label: 'Alta', color: 'text-orange-600 dark:text-orange-400' },
    urgent: { label: 'Urgente', color: 'text-red-600 dark:text-red-400' },
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.cnpj.includes(searchTerm);
    const matchesRegime = filterRegime === 'all' || company.regime === filterRegime;
    const matchesStatus = filterStatus === 'all' || company.status === filterStatus;
    return matchesSearch && matchesRegime && matchesStatus;
  });

  // Stats
  const totalCompanies = companies.filter(c => c.status === 'active').length;
  const totalEmployees = companies.reduce((sum, c) => sum + c.employees, 0);
  const totalPayroll = companies.reduce((sum, c) => sum + c.payrollAmount, 0);
  const pendingTasks = tasks.filter(t => t.status !== 'completed').length;
  const expiringCertificates = certificates.filter(c => c.status === 'expiring' || c.status === 'expired').length;
  const pendingDebts = debts.filter(d => d.status !== 'paid').length;

  // Regime distribution
  const regimeData = [
    { name: 'Simples Nacional', value: companies.filter(c => c.regime === 'Simples Nacional').length, color: '#3b82f6' },
    { name: 'Lucro Presumido', value: companies.filter(c => c.regime === 'Lucro Presumido').length, color: '#10b981' },
    { name: 'Lucro Real', value: companies.filter(c => c.regime === 'Lucro Real').length, color: '#f59e0b' },
  ];

  // Payroll evolution (last 6 months)
  const payrollData = [
    { month: 'Out', amount: 850 },
    { month: 'Nov', amount: 870 },
    { month: 'Dez', amount: 920 },
    { month: 'Jan', amount: 890 },
    { month: 'Fev', amount: 900 },
    { month: 'Mar', amount: 907 },
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

  const getDaysUntilExpiry = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center">
              <UserCog className="w-6 h-6 text-white" />
            </div>
            Departamento Pessoal
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de empresas, folha de pagamento e obrigações trabalhistas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <Download className="w-5 h-5" />
            <span className="font-medium">Relatório</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-600 to-pink-700 text-white rounded-lg hover:from-pink-700 hover:to-pink-800 transition-all shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Nova Empresa</span>
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
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
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
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Building2 className="w-4 h-4 inline-block mr-2" />
            Empresas
          </button>
          <button
            onClick={() => setActiveTab('certificates')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'certificates'
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Shield className="w-4 h-4 inline-block mr-2" />
            Certificados
            {expiringCertificates > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {expiringCertificates}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'debts'
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            Débitos
            {pendingDebts > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-white rounded-full text-xs">
                {pendingDebts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'tasks'
                ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <CheckSquare className="w-4 h-4 inline-block mr-2" />
            Tarefas
            {pendingTasks > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                {pendingTasks}
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Colaboradores</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalEmployees}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Folha Total</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalPayroll)}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pendências</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingTasks}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payroll Evolution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Evolução da Folha
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Últimos 6 meses (em milhares)</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={payrollData}>
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
                  <Area type="monotone" dataKey="amount" stroke="#ec4899" fill="#ec4899" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Regime Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Distribuição por Regime
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Empresas ativas</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={regimeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {regimeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {regimeData.map((item, index) => (
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

          {/* Alerts and Quick Access */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alerts */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Alertas e Vencimentos
                </h3>
              </div>
              <div className="space-y-3">
                {/* Expiring Certificates */}
                {certificates.filter(c => c.status === 'expiring' || c.status === 'expired').slice(0, 3).map((cert) => {
                  const daysLeft = getDaysUntilExpiry(cert.expiryDate);
                  return (
                    <div key={cert.id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Certificado {cert.type} - {cert.holder}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {daysLeft < 0 ? `Expirado há ${Math.abs(daysLeft)} dias` : `Expira em ${daysLeft} dias`}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Overdue Debts */}
                {debts.filter(d => d.status === 'overdue').slice(0, 2).map((debt) => (
                  <div key={debt.id} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {debt.type} - {debt.company}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {formatCurrency(debt.amount)} - Vencido em {formatDate(debt.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Tasks */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  Próximas Tarefas
                </h3>
                <button 
                  onClick={() => setActiveTab('tasks')}
                  className="text-sm text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 font-medium"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3">
                {tasks.filter(t => t.status !== 'completed').slice(0, 5).map((task) => {
                  const TypeIcon = taskTypeConfig[task.type].icon;
                  return (
                    <div key={task.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${taskTypeConfig[task.type].color.replace('text', 'bg').replace('dark:text', 'dark:bg')} flex items-center justify-center flex-shrink-0`}>
                          <TypeIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">{task.company}</span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.dueDate)}
                            </span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig[task.priority].color}`}>
                          {priorityConfig[task.priority].label}
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
                  placeholder="Buscar empresas por nome ou CNPJ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-400" />
                <select
                  value={filterRegime}
                  onChange={(e) => setFilterRegime(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">Todos os Regimes</option>
                  <option value="Simples Nacional">Simples Nacional</option>
                  <option value="Lucro Presumido">Lucro Presumido</option>
                  <option value="Lucro Real">Lucro Real</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">Todos os Status</option>
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                  <option value="suspended">Suspensa</option>
                </select>
              </div>
            </div>
          </div>

          {/* Companies Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCompanies.map((company) => {
              const StatusIcon = statusConfig[company.status].icon;
              return (
                <div 
                  key={company.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-600 transition-all cursor-pointer"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{company.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{company.cnpj}</p>
                    </div>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Status and Regime */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[company.status].color} flex items-center gap-1`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig[company.status].label}
                    </span>
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
                      {company.regime}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Colaboradores:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{company.employees}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Folha:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(company.payrollAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Segmento:</span>
                      <span className="font-medium text-gray-900 dark:text-white">{company.segment}</span>
                    </div>
                    {company.group && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Grupo:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{company.group}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600 dark:text-gray-400">
                      Responsável: <span className="font-medium text-gray-900 dark:text-white">{company.responsible}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Titular</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Documento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Senha</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Validade</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {certificates.map((cert) => {
                    const StatusIcon = certificateStatusConfig[cert.status].icon;
                    const daysLeft = getDaysUntilExpiry(cert.expiryDate);
                    
                    return (
                      <tr key={cert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            cert.type === 'PJ' 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          }`}>
                            {cert.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900 dark:text-white">{cert.holder}</p>
                          {cert.company && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">{cert.company}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-mono">
                            {cert.cnpj || cert.cpf}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-gray-900 dark:text-white">
                              {showPassword[cert.id] ? cert.password : '••••••••••'}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(cert.id)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                            >
                              {showPassword[cert.id] ? (
                                <Lock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              ) : (
                                <Unlock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(cert.password)}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                            >
                              <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(cert.expiryDate)}</p>
                          <p className={`text-xs ${
                            daysLeft < 0 ? 'text-red-600 dark:text-red-400' :
                            daysLeft <= 30 ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-gray-600 dark:text-gray-400'
                          }`}>
                            {daysLeft < 0 ? `Expirado há ${Math.abs(daysLeft)} dias` : `${daysLeft} dias`}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${certificateStatusConfig[cert.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {certificateStatusConfig[cert.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                              <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Valor</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Vencimento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {debts.map((debt) => {
                    const StatusIcon = debtStatusConfig[debt.status].icon;
                    return (
                      <tr key={debt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900 dark:text-white">{debt.company}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            debt.type === 'INSS' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                            debt.type === 'FGTS' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            debt.type === 'IRRF' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                            debt.type === 'ISS' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {debt.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{debt.competence}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(debt.amount)}</p>
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
                          {debt.status === 'pending' || debt.status === 'overdue' ? (
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

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="space-y-4">
            {tasks.map((task) => {
              const TypeIcon = taskTypeConfig[task.type].icon;
              const StatusIcon = taskStatusConfig[task.status].icon;
              
              return (
                <div 
                  key={task.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg ${taskTypeConfig[task.type].color.replace('text', 'bg').replace('dark:text', 'dark:bg')} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{task.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{task.company}</p>
                        </div>
                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${taskTypeConfig[task.type].color} flex items-center gap-1`}>
                          <TypeIcon className="w-3 h-3" />
                          {taskTypeConfig[task.type].label}
                        </span>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${taskStatusConfig[task.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {taskStatusConfig[task.status].label}
                        </span>

                        <span className={`px-2.5 py-1 rounded text-xs font-medium ${priorityConfig[task.priority].color}`}>
                          {priorityConfig[task.priority].label}
                        </span>

                        <span className="px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.dueDate)}
                        </span>

                        <span className="px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {task.assignee}
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

