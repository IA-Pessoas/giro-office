import { useState } from 'react';
import { 
  Users,
  Plus,
  Search,
  Filter,
  Calendar,
  TrendingUp,
  Clock,
  FileText,
  Award,
  AlertCircle,
  CheckCircle,
  XCircle,
  MoreVertical,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Cake,
  UserCheck,
  UserX,
  UserPlus,
  Download,
  Eye,
  Edit,
  Trash2,
  BarChart3,
  PieChart as PieChartIcon,
  Bell,
  MessageSquare,
  Star,
  ChevronDown,
  Filter as FilterIcon,
  LogIn,
  LogOut,
  Coffee,
  PlayCircle,
  PauseCircle
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Employee {
  id: string;
  name: string;
  avatar: string;
  color: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  admissionDate: string;
  birthday: string;
  status: 'active' | 'vacation' | 'leave' | 'inactive';
  salary?: number;
  performance?: number;
}

interface Request {
  id: string;
  employee: string;
  type: 'vacation' | 'leave' | 'medical' | 'reimbursement';
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  startDate?: string;
  endDate?: string;
  description: string;
}

export function FigmaRH() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'requests' | 'evaluations' | 'timetracking'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const employees: Employee[] = [
    {
      id: '1',
      name: 'João Silva',
      avatar: 'JS',
      color: 'bg-blue-500',
      role: 'Desenvolvedor Senior',
      department: 'Tecnologia',
      email: 'joao.silva@empresa.com',
      phone: '(11) 98765-4321',
      admissionDate: '2022-01-15',
      birthday: '1990-05-20',
      status: 'active',
      salary: 12000,
      performance: 95
    },
    {
      id: '2',
      name: 'Maria Santos',
      avatar: 'MS',
      color: 'bg-green-500',
      role: 'Gerente de Projetos',
      department: 'Projetos',
      email: 'maria.santos@empresa.com',
      phone: '(11) 98765-4322',
      admissionDate: '2021-03-10',
      birthday: '1988-03-18',
      status: 'active',
      salary: 15000,
      performance: 92
    },
    {
      id: '3',
      name: 'Carlos Oliveira',
      avatar: 'CO',
      color: 'bg-purple-500',
      role: 'Analista Fiscal',
      department: 'Fiscal',
      email: 'carlos.oliveira@empresa.com',
      phone: '(11) 98765-4323',
      admissionDate: '2020-06-22',
      birthday: '1985-12-05',
      status: 'vacation',
      salary: 8500,
      performance: 88
    },
    {
      id: '4',
      name: 'Ana Costa',
      avatar: 'AC',
      color: 'bg-pink-500',
      role: 'Analista de RH',
      department: 'RH',
      email: 'ana.costa@empresa.com',
      phone: '(11) 98765-4324',
      admissionDate: '2023-02-01',
      birthday: '1992-08-14',
      status: 'active',
      salary: 7000,
      performance: 90
    },
    {
      id: '5',
      name: 'Pedro Alves',
      avatar: 'PA',
      color: 'bg-indigo-500',
      role: 'Designer UX/UI',
      department: 'Tecnologia',
      email: 'pedro.alves@empresa.com',
      phone: '(11) 98765-4325',
      admissionDate: '2022-09-12',
      birthday: '1993-11-22',
      status: 'active',
      salary: 9000,
      performance: 94
    },
    {
      id: '6',
      name: 'Julia Fernandes',
      avatar: 'JF',
      color: 'bg-orange-500',
      role: 'Analista Comercial',
      department: 'Comercial',
      email: 'julia.fernandes@empresa.com',
      phone: '(11) 98765-4326',
      admissionDate: '2021-11-05',
      birthday: '1991-04-30',
      status: 'active',
      salary: 7500,
      performance: 87
    },
  ];

  const requests: Request[] = [
    {
      id: '1',
      employee: 'João Silva',
      type: 'vacation',
      status: 'pending',
      date: '2026-03-15',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      description: 'Férias programadas'
    },
    {
      id: '2',
      employee: 'Ana Costa',
      type: 'leave',
      status: 'approved',
      date: '2026-03-10',
      startDate: '2026-03-20',
      endDate: '2026-03-20',
      description: 'Assuntos pessoais'
    },
    {
      id: '3',
      employee: 'Carlos Oliveira',
      type: 'medical',
      status: 'approved',
      date: '2026-03-12',
      startDate: '2026-03-13',
      endDate: '2026-03-14',
      description: 'Atestado médico - Consulta'
    },
    {
      id: '4',
      employee: 'Maria Santos',
      type: 'reimbursement',
      status: 'pending',
      date: '2026-03-16',
      description: 'Reembolso de transporte - R$ 250,00'
    },
    {
      id: '5',
      employee: 'Pedro Alves',
      type: 'vacation',
      status: 'rejected',
      date: '2026-03-08',
      startDate: '2026-03-25',
      endDate: '2026-04-05',
      description: 'Período indisponível'
    },
  ];

  const statusConfig = {
    active: { label: 'Ativo', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: UserCheck },
    vacation: { label: 'Férias', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Calendar },
    leave: { label: 'Afastado', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Clock },
    inactive: { label: 'Inativo', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: UserX },
  };

  const requestTypeConfig = {
    vacation: { label: 'Férias', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Calendar },
    leave: { label: 'Folga', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', icon: Clock },
    medical: { label: 'Atestado', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: FileText },
    reimbursement: { label: 'Reembolso', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: TrendingUp },
  };

  const requestStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Clock },
    approved: { label: 'Aprovada', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    rejected: { label: 'Rejeitada', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = filterDepartment === 'all' || emp.department === filterDepartment;
    const matchesStatus = filterStatus === 'all' || emp.status === filterStatus;
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const departments = Array.from(new Set(employees.map(e => e.department)));

  // Stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const onVacation = employees.filter(e => e.status === 'vacation').length;
  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  // Upcoming birthdays (next 30 days)
  const today = new Date();
  const upcomingBirthdays = employees.filter(emp => {
    const birthday = new Date(emp.birthday);
    const thisYear = today.getFullYear();
    const nextBirthday = new Date(thisYear, birthday.getMonth(), birthday.getDate());
    
    if (nextBirthday < today) {
      nextBirthday.setFullYear(thisYear + 1);
    }
    
    const diffDays = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 30;
  }).sort((a, b) => {
    const dateA = new Date(a.birthday);
    const dateB = new Date(b.birthday);
    return dateA.getMonth() - dateB.getMonth() || dateA.getDate() - dateB.getDate();
  });

  // Department distribution
  const departmentData = departments.map(dept => ({
    name: dept,
    value: employees.filter(e => e.department === dept).length,
    color: `hsl(${departments.indexOf(dept) * 60}, 70%, 50%)`
  }));

  // Admissions per month (last 6 months)
  const admissionsData = [
    { month: 'Out', admissions: 3, terminations: 1 },
    { month: 'Nov', admissions: 2, terminations: 0 },
    { month: 'Dez', admissions: 1, terminations: 2 },
    { month: 'Jan', admissions: 4, terminations: 1 },
    { month: 'Fev', admissions: 2, terminations: 0 },
    { month: 'Mar', admissions: 3, terminations: 1 },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const calculateYears = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const years = today.getFullYear() - date.getFullYear();
    const months = today.getMonth() - date.getMonth();
    
    if (months < 0 || (months === 0 && today.getDate() < date.getDate())) {
      return years - 1;
    }
    return years;
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            Recursos Humanos
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão completa de colaboradores, solicitações e avaliações
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-lg hover:from-rose-700 hover:to-rose-800 transition-all shadow-md hover:shadow-lg">
          <Plus className="w-5 h-5" />
          <span className="font-medium">Novo Colaborador</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'employees'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline-block mr-2" />
            Colaboradores
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'requests'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            Solicitações
            {pendingRequests > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {pendingRequests}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('evaluations')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'evaluations'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Award className="w-4 h-4 inline-block mr-2" />
            Avaliações
          </button>
          <button
            onClick={() => setActiveTab('timetracking')}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'timetracking'
                ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Clock className="w-4 h-4 inline-block mr-2" />
            Controle de Ponto
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total de Colaboradores</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalEmployees}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Colaboradores Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeEmployees}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <UserCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Em Férias</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{onVacation}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Solicitações Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{pendingRequests}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Admissions Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  Admissões e Desligamentos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Últimos 6 meses</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={admissionsData}>
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
                  <Bar dataKey="admissions" name="Admissões" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="terminations" name="Desligamentos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Department Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  Distribuição por Departamento
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total de colaboradores</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {departmentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {departmentData.map((item, index) => (
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

          {/* Birthdays and Recent Requests */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Birthdays */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Cake className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  Aniversariantes do Mês
                </h3>
                <span className="text-sm text-gray-600 dark:text-gray-400">{upcomingBirthdays.length} pessoas</span>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {upcomingBirthdays.map((emp) => {
                  const birthday = new Date(emp.birthday);
                  const age = new Date().getFullYear() - birthday.getFullYear();
                  
                  return (
                    <div key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors">
                      <div className={`w-10 h-10 rounded-full ${emp.color} flex items-center justify-center text-white font-semibold`}>
                        {emp.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">{emp.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {birthday.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} • {age} anos
                        </p>
                      </div>
                      <Cake className="w-5 h-5 text-yellow-500" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Requests */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  Solicitações Recentes
                </h3>
                <button 
                  onClick={() => setActiveTab('requests')}
                  className="text-sm text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium"
                >
                  Ver todas
                </button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {requests.slice(0, 5).map((req) => {
                  const TypeIcon = requestTypeConfig[req.type].icon;
                  const StatusIcon = requestStatusConfig[req.status].icon;
                  
                  return (
                    <div key={req.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">{req.employee}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{req.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${requestTypeConfig[req.type].color} flex items-center gap-1`}>
                          <TypeIcon className="w-3 h-3" />
                          {requestTypeConfig[req.type].label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${requestStatusConfig[req.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {requestStatusConfig[req.status].label}
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

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar colaboradores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <FilterIcon className="w-5 h-5 text-gray-400" />
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="all">Todos Departamentos</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="all">Todos Status</option>
                  <option value="active">Ativo</option>
                  <option value="vacation">Férias</option>
                  <option value="leave">Afastado</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Employees Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map((emp) => {
              const StatusIcon = statusConfig[emp.status].icon;
              const yearsAtCompany = calculateYears(emp.admissionDate);
              
              return (
                <div 
                  key={emp.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-rose-300 dark:hover:border-rose-600 transition-all cursor-pointer"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-full ${emp.color} flex items-center justify-center text-white text-lg font-semibold`}>
                        {emp.avatar}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{emp.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{emp.role}</p>
                      </div>
                    </div>
                    <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                      <MoreVertical className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Status */}
                  <div className="mb-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[emp.status].color} flex items-center gap-1 w-fit`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig[emp.status].label}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Briefcase className="w-4 h-4" />
                      <span>{emp.department}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Phone className="w-4 h-4" />
                      <span>{emp.phone}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-white">{yearsAtCompany}</span> {yearsAtCompany === 1 ? 'ano' : 'anos'} na empresa
                    </div>
                    {emp.performance && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-semibold text-gray-900 dark:text-white">{emp.performance}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Colaborador</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Período</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {requests.map((req) => {
                    const TypeIcon = requestTypeConfig[req.type].icon;
                    const StatusIcon = requestStatusConfig[req.status].icon;
                    
                    return (
                      <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900 dark:text-white">{req.employee}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${requestTypeConfig[req.type].color} flex items-center gap-1 w-fit`}>
                            <TypeIcon className="w-3 h-3" />
                            {requestTypeConfig[req.type].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {req.startDate && req.endDate ? (
                              <>
                                {formatDate(req.startDate)} - {formatDate(req.endDate)}
                              </>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">{req.description}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${requestStatusConfig[req.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {requestStatusConfig[req.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {req.status === 'pending' ? (
                            <div className="flex items-center gap-2">
                              <button className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                              </button>
                              <button className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors">
                                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
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

      {/* Evaluations Tab */}
      {activeTab === 'evaluations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map((emp) => (
              <div 
                key={emp.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-full ${emp.color} flex items-center justify-center text-white text-lg font-semibold`}>
                    {emp.avatar}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{emp.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{emp.role}</p>
                  </div>
                </div>

                {emp.performance && (
                  <>
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Performance Geral</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{emp.performance}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            emp.performance >= 90 ? 'bg-green-500' :
                            emp.performance >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${emp.performance}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star 
                          key={star}
                          className={`w-5 h-5 ${
                            star <= Math.round(emp.performance / 20) 
                              ? 'text-yellow-500 fill-yellow-500' 
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}

                <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">Nova Avaliação</span>
                  </button>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <Eye className="w-4 h-4" />
                    <span className="text-sm font-medium">Ver Histórico</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Tracking Tab */}
      {activeTab === 'timetracking' && (
        <div className="space-y-6">
          {/* P onto Banner */}
          <div className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Clock className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-1">Controle de Ponto</h2>
                <p className="text-rose-100">Gestão completa de jornada de trabalho e registro de ponto dos colaboradores</p>
              </div>
              <button className="px-6 py-3 bg-white text-rose-600 rounded-lg font-semibold hover:bg-rose-50 transition-colors shadow-lg">
                <Plus className="w-5 h-5 inline-block mr-2" />
                Registrar Ponto
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Presentes Hoje</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">124</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">+8 vs ontem</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md">
                  <UserCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Horas Extras Mês</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">342h</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">15 colaboradores</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Clock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Ajustes Pendentes</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">8</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Aguardando aprovação</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Faltas do Mês</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">12</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">-3 vs mês anterior</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-md">
                  <UserX className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Time Records */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                Registros de Hoje
              </h3>
              <input
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Colaborador</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Entrada</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Pausa</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Retorno</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Saída</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Horas</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {employees.slice(0, 5).map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${emp.color} flex items-center justify-center text-white text-sm font-semibold`}>
                            {emp.avatar}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{emp.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{emp.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">08:00</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">12:00</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">13:00</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">18:00</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">9h</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                          Completo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
