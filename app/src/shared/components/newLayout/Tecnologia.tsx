import { useState } from 'react';
import { 
  Laptop,
  Plus,
  Search,
  Filter,
  Users,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  Download,
  Upload,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Monitor,
  Smartphone,
  Printer,
  HardDrive,
  Cpu,
  Package,
  TrendingUp,
  Activity,
  Settings,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckSquare,
  XCircle,
  PlayCircle,
  PauseCircle,
  Wrench,
  MapPin,
  Building2,
  Phone,
  Mail,
  Key,
  Bot,
  Zap,
  RefreshCw,
  Archive,
  Send,
  MessageSquare,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface SystemUser {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  status: 'active' | 'inactive' | 'suspended';
  permissions: string[];
  createdAt: string;
  lastAccess?: string;
}

interface Equipment {
  id: string;
  name: string;
  type: 'Notebook' | 'Desktop' | 'Monitor' | 'Smartphone' | 'Tablet' | 'Impressora' | 'Periférico';
  brand: string;
  model: string;
  serialNumber: string;
  status: 'active' | 'inactive' | 'maintenance' | 'disposed';
  assignedTo?: string;
  location: string;
  acquisitionDate: string;
  warrantyUntil?: string;
  observations?: string;
}

interface StockItem {
  id: string;
  name: string;
  category: 'Hardware' | 'Periféricos' | 'Cabos' | 'Acessórios' | 'Licenças' | 'Outros';
  quantity: number;
  minQuantity: number;
  location: string;
  unitPrice: number;
  lastEntry?: string;
  lastExit?: string;
}

interface Term {
  id: string;
  type: 'Entrega' | 'Devolução' | 'Responsabilidade' | 'Treinamento';
  user: string;
  equipment?: string;
  generatedAt: string;
  signedAt?: string;
  status: 'pending' | 'signed' | 'expired';
  pdfUrl?: string;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  type: 'incident' | 'request' | 'change' | 'problem';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'waiting' | 'resolved' | 'closed';
  requester: string;
  assignee?: string;
  department: string;
  createdAt: string;
  resolvedAt?: string;
  category: 'Hardware' | 'Software' | 'Rede' | 'Acesso' | 'Email' | 'Impressão' | 'Outros';
}

interface Robot {
  id: string;
  name: string;
  description: string;
  type: 'Backup' | 'Relatório' | 'Integração' | 'Manutenção' | 'Monitoramento';
  schedule: string;
  status: 'active' | 'inactive' | 'running' | 'failed';
  lastRun?: string;
  nextRun?: string;
  successRate: number;
}

export function Tecnologia() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'inventory' | 'stock' | 'terms' | 'tickets' | 'robots'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const systemUsers: SystemUser[] = [
    {
      id: '1',
      name: 'Ana Costa',
      email: 'ana.costa@office.com',
      department: 'RH',
      position: 'Gerente de RH',
      status: 'active',
      permissions: ['rh.read', 'rh.write', 'users.read'],
      createdAt: '2025-01-15',
      lastAccess: '2026-03-17'
    },
    {
      id: '2',
      name: 'Carlos Oliveira',
      email: 'carlos.oliveira@office.com',
      department: 'Comercial',
      position: 'Diretor Comercial',
      status: 'active',
      permissions: ['commercial.admin', 'reports.read', 'clients.write'],
      createdAt: '2025-01-10',
      lastAccess: '2026-03-16'
    },
    {
      id: '3',
      name: 'Roberto Alves',
      email: 'roberto.alves@office.com',
      department: 'Marketing',
      position: 'Coordenador de Marketing',
      status: 'active',
      permissions: ['marketing.write', 'campaigns.admin'],
      createdAt: '2025-02-01',
      lastAccess: '2026-03-17'
    },
    {
      id: '4',
      name: 'Maria Santos',
      email: 'maria.santos@office.com',
      department: 'Financeiro',
      position: 'Analista Financeiro',
      status: 'suspended',
      permissions: ['finance.read'],
      createdAt: '2025-03-05',
      lastAccess: '2026-02-28'
    },
  ];

  const equipment: Equipment[] = [
    {
      id: '1',
      name: 'Notebook Dell Latitude 5420',
      type: 'Notebook',
      brand: 'Dell',
      model: 'Latitude 5420',
      serialNumber: 'DL5420-2024-001',
      status: 'active',
      assignedTo: 'Ana Costa',
      location: 'RH - Sala 201',
      acquisitionDate: '2024-06-15',
      warrantyUntil: '2027-06-15',
      observations: 'i5 11ª geração, 16GB RAM, SSD 512GB'
    },
    {
      id: '2',
      name: 'Desktop HP EliteDesk 800',
      type: 'Desktop',
      brand: 'HP',
      model: 'EliteDesk 800 G6',
      serialNumber: 'HP800-2024-015',
      status: 'active',
      assignedTo: 'Carlos Oliveira',
      location: 'Comercial - Sala 105',
      acquisitionDate: '2024-08-20',
      warrantyUntil: '2027-08-20',
      observations: 'i7 10ª geração, 32GB RAM, SSD 1TB'
    },
    {
      id: '3',
      name: 'Monitor LG UltraWide 29"',
      type: 'Monitor',
      brand: 'LG',
      model: '29WK600',
      serialNumber: 'LG29-2024-089',
      status: 'active',
      assignedTo: 'Roberto Alves',
      location: 'Marketing - Sala 302',
      acquisitionDate: '2024-09-10',
      warrantyUntil: '2027-09-10'
    },
    {
      id: '4',
      name: 'iPhone 13 Pro',
      type: 'Smartphone',
      brand: 'Apple',
      model: 'iPhone 13 Pro',
      serialNumber: 'APPL13-2024-023',
      status: 'active',
      assignedTo: 'Carlos Oliveira',
      location: 'Comercial',
      acquisitionDate: '2024-07-05',
      warrantyUntil: '2025-07-05'
    },
    {
      id: '5',
      name: 'Impressora HP LaserJet Pro',
      type: 'Impressora',
      brand: 'HP',
      model: 'LaserJet Pro M404dn',
      serialNumber: 'HPLJ-2024-007',
      status: 'maintenance',
      location: 'Financeiro - Copa',
      acquisitionDate: '2024-05-20',
      warrantyUntil: '2027-05-20',
      observations: 'Em manutenção preventiva - previsão 20/03'
    },
    {
      id: '6',
      name: 'Notebook Lenovo ThinkPad',
      type: 'Notebook',
      brand: 'Lenovo',
      model: 'ThinkPad X1 Carbon',
      serialNumber: 'LEN-X1-2023-045',
      status: 'inactive',
      location: 'Estoque TI',
      acquisitionDate: '2023-11-10',
      warrantyUntil: '2026-11-10',
      observations: 'Aguardando realocação'
    },
  ];

  const stockItems: StockItem[] = [
    {
      id: '1',
      name: 'Mouse USB Logitech',
      category: 'Periféricos',
      quantity: 15,
      minQuantity: 10,
      location: 'Estoque TI - Prateleira A1',
      unitPrice: 45,
      lastEntry: '2026-03-01'
    },
    {
      id: '2',
      name: 'Teclado USB Dell',
      category: 'Periféricos',
      quantity: 8,
      minQuantity: 10,
      location: 'Estoque TI - Prateleira A1',
      unitPrice: 85,
      lastExit: '2026-03-10'
    },
    {
      id: '3',
      name: 'Cabo HDMI 2.0 - 2m',
      category: 'Cabos',
      quantity: 25,
      minQuantity: 15,
      location: 'Estoque TI - Prateleira B2',
      unitPrice: 35,
      lastEntry: '2026-02-20'
    },
    {
      id: '4',
      name: 'Memória RAM DDR4 8GB',
      category: 'Hardware',
      quantity: 4,
      minQuantity: 5,
      location: 'Estoque TI - Armário Seguro',
      unitPrice: 180,
      lastExit: '2026-03-05'
    },
    {
      id: '5',
      name: 'SSD Kingston 480GB',
      category: 'Hardware',
      quantity: 6,
      minQuantity: 5,
      location: 'Estoque TI - Armário Seguro',
      unitPrice: 320,
      lastEntry: '2026-02-28'
    },
    {
      id: '6',
      name: 'Licença Office 365 Business',
      category: 'Licenças',
      quantity: 50,
      minQuantity: 20,
      location: 'Digital',
      unitPrice: 35,
      lastEntry: '2026-03-01'
    },
  ];

  const terms: Term[] = [
    {
      id: '1',
      type: 'Entrega',
      user: 'Ana Costa',
      equipment: 'Notebook Dell Latitude 5420',
      generatedAt: '2024-06-15',
      signedAt: '2024-06-15',
      status: 'signed',
      pdfUrl: '/terms/001.pdf'
    },
    {
      id: '2',
      type: 'Responsabilidade',
      user: 'Carlos Oliveira',
      equipment: 'Desktop HP EliteDesk 800',
      generatedAt: '2024-08-20',
      signedAt: '2024-08-20',
      status: 'signed',
      pdfUrl: '/terms/002.pdf'
    },
    {
      id: '3',
      type: 'Entrega',
      user: 'Roberto Alves',
      equipment: 'Monitor LG UltraWide 29"',
      generatedAt: '2026-03-15',
      status: 'pending'
    },
    {
      id: '4',
      type: 'Treinamento',
      user: 'Maria Santos',
      generatedAt: '2026-03-05',
      signedAt: '2026-03-05',
      status: 'signed',
      pdfUrl: '/terms/004.pdf'
    },
  ];

  const tickets: Ticket[] = [
    {
      id: '1',
      title: 'Computador não liga',
      description: 'Desktop do setor financeiro não está ligando após queda de energia',
      type: 'incident',
      priority: 'high',
      status: 'in-progress',
      requester: 'Maria Santos',
      assignee: 'Pedro TI',
      department: 'Financeiro',
      createdAt: '2026-03-17 09:15',
      category: 'Hardware'
    },
    {
      id: '2',
      title: 'Instalação de software',
      description: 'Necessário instalar Adobe Creative Suite no notebook',
      type: 'request',
      priority: 'medium',
      status: 'open',
      requester: 'Roberto Alves',
      department: 'Marketing',
      createdAt: '2026-03-17 10:30',
      category: 'Software'
    },
    {
      id: '3',
      title: 'Impressora offline',
      description: 'Impressora do RH não está sendo reconhecida na rede',
      type: 'incident',
      priority: 'medium',
      status: 'waiting',
      requester: 'Ana Costa',
      assignee: 'João TI',
      department: 'RH',
      createdAt: '2026-03-16 14:20',
      category: 'Impressão'
    },
    {
      id: '4',
      title: 'Reset de senha',
      description: 'Usuário esqueceu senha do sistema',
      type: 'request',
      priority: 'low',
      status: 'resolved',
      requester: 'Carlos Oliveira',
      assignee: 'Pedro TI',
      department: 'Comercial',
      createdAt: '2026-03-16 11:00',
      resolvedAt: '2026-03-16 11:15',
      category: 'Acesso'
    },
    {
      id: '5',
      title: 'Lentidão na rede',
      description: 'Queda de performance na conexão de internet',
      type: 'problem',
      priority: 'critical',
      status: 'in-progress',
      requester: 'TI - Automático',
      assignee: 'Pedro TI',
      department: 'Todos',
      createdAt: '2026-03-17 08:00',
      category: 'Rede'
    },
  ];

  const robots: Robot[] = [
    {
      id: '1',
      name: 'Backup Automático Diário',
      description: 'Backup incremental de todos os servidores',
      type: 'Backup',
      schedule: 'Diariamente às 02:00',
      status: 'active',
      lastRun: '2026-03-17 02:00',
      nextRun: '2026-03-18 02:00',
      successRate: 98.5
    },
    {
      id: '2',
      name: 'Relatório de Inventário',
      description: 'Geração automática de relatório de equipamentos',
      type: 'Relatório',
      schedule: 'Semanalmente às segundas 08:00',
      status: 'active',
      lastRun: '2026-03-17 08:00',
      nextRun: '2026-03-24 08:00',
      successRate: 100
    },
    {
      id: '3',
      name: 'Sincronização AD com Sistema',
      description: 'Sincroniza usuários do Active Directory com o Office',
      type: 'Integração',
      schedule: 'A cada 6 horas',
      status: 'active',
      lastRun: '2026-03-17 12:00',
      nextRun: '2026-03-17 18:00',
      successRate: 99.2
    },
    {
      id: '4',
      name: 'Limpeza de Logs Antigos',
      description: 'Remove logs com mais de 90 dias',
      type: 'Manutenção',
      schedule: 'Mensalmente dia 1 às 03:00',
      status: 'active',
      lastRun: '2026-03-01 03:00',
      nextRun: '2026-04-01 03:00',
      successRate: 100
    },
    {
      id: '5',
      name: 'Monitor de Serviços Críticos',
      description: 'Monitora disponibilidade de serviços essenciais',
      type: 'Monitoramento',
      schedule: 'A cada 5 minutos',
      status: 'running',
      lastRun: '2026-03-17 14:55',
      nextRun: '2026-03-17 15:00',
      successRate: 99.9
    },
    {
      id: '6',
      name: 'Atualização de Antivírus',
      description: 'Atualiza definições de vírus em todas as estações',
      type: 'Manutenção',
      schedule: 'Diariamente às 01:00',
      status: 'failed',
      lastRun: '2026-03-17 01:00',
      nextRun: '2026-03-18 01:00',
      successRate: 95.5
    },
  ];

  const statusConfig = {
    active: { label: 'Ativo', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    inactive: { label: 'Inativo', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: PauseCircle },
    maintenance: { label: 'Manutenção', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Wrench },
    disposed: { label: 'Descartado', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
    suspended: { label: 'Suspenso', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: AlertTriangle },
    running: { label: 'Executando', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: PlayCircle },
    failed: { label: 'Falhou', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
  };

  const ticketStatusConfig = {
    open: { label: 'Aberto', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: AlertCircle },
    'in-progress': { label: 'Em Andamento', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: PlayCircle },
    waiting: { label: 'Aguardando', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: Clock },
    resolved: { label: 'Resolvido', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    closed: { label: 'Fechado', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', icon: CheckSquare },
  };

  const priorityConfig = {
    low: { label: 'Baixa', color: 'text-gray-600 dark:text-gray-400' },
    medium: { label: 'Média', color: 'text-yellow-600 dark:text-yellow-400' },
    high: { label: 'Alta', color: 'text-orange-600 dark:text-orange-400' },
    critical: { label: 'Crítica', color: 'text-red-600 dark:text-red-400' },
  };

  const termStatusConfig = {
    pending: { label: 'Pendente', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', icon: Clock },
    signed: { label: 'Assinado', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: CheckCircle },
    expired: { label: 'Expirado', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: XCircle },
  };

  // Stats
  const totalUsers = systemUsers.length;
  const activeUsers = systemUsers.filter(u => u.status === 'active').length;
  const totalEquipment = equipment.length;
  const activeEquipment = equipment.filter(e => e.status === 'active').length;
  const equipmentInMaintenance = equipment.filter(e => e.status === 'maintenance').length;
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in-progress').length;
  const criticalTickets = tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved').length;
  const lowStockItems = stockItems.filter(s => s.quantity <= s.minQuantity).length;
  const pendingTerms = terms.filter(t => t.status === 'pending').length;
  const activeRobots = robots.filter(r => r.status === 'active' || r.status === 'running').length;

  // Equipment by type
  const equipmentByType = [
    { name: 'Notebooks', value: equipment.filter(e => e.type === 'Notebook').length, color: '#3b82f6' },
    { name: 'Desktops', value: equipment.filter(e => e.type === 'Desktop').length, color: '#10b981' },
    { name: 'Monitores', value: equipment.filter(e => e.type === 'Monitor').length, color: '#f59e0b' },
    { name: 'Smartphones', value: equipment.filter(e => e.type === 'Smartphone').length, color: '#8b5cf6' },
    { name: 'Outros', value: equipment.filter(e => !['Notebook', 'Desktop', 'Monitor', 'Smartphone'].includes(e.type)).length, color: '#6b7280' },
  ].filter(item => item.value > 0);

  // Tickets by status (last 7 days)
  const ticketsTrend = [
    { day: 'Seg', opened: 8, resolved: 6 },
    { day: 'Ter', opened: 12, resolved: 9 },
    { day: 'Qua', opened: 7, resolved: 10 },
    { day: 'Qui', opened: 15, resolved: 12 },
    { day: 'Sex', opened: 10, resolved: 14 },
    { day: 'Sáb', opened: 3, resolved: 5 },
    { day: 'Dom', opened: 2, resolved: 3 },
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
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Laptop className="w-6 h-6 text-white" />
            </div>
            Departamento de Tecnologia
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestão de usuários, equipamentos, chamados e automações
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <Download className="w-5 h-5" />
            <span className="font-medium">Exportar Relatório</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="font-medium">Novo Chamado</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1">
        <div className="flex items-center gap-1 overflow-x-auto u-scrollbar-system">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'users'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline-block mr-2" />
            Usuários
            {activeUsers > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-green-500 text-white rounded-full text-xs">
                {activeUsers}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'inventory'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Monitor className="w-4 h-4 inline-block mr-2" />
            Inventário
            {equipmentInMaintenance > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-white rounded-full text-xs">
                {equipmentInMaintenance}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'stock'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Package className="w-4 h-4 inline-block mr-2" />
            Estoque
            {lowStockItems > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                {lowStockItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'terms'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            Termos
            {pendingTerms > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-500 text-white rounded-full text-xs">
                {pendingTerms}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'tickets'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline-block mr-2" />
            Chamados
            {openTickets > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                {openTickets}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('robots')}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'robots'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Bot className="w-4 h-4 inline-block mr-2" />
            Robôs
            {activeRobots > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-500 text-white rounded-full text-xs">
                {activeRobots}
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
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Usuários Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeUsers}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">de {totalUsers} totais</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Equipamentos Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeEquipment}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">de {totalEquipment} totais</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Chamados Abertos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{openTickets}</p>
                  {criticalTickets > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {criticalTickets} críticos
                    </p>
                  )}
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Robôs Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeRobots}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">de {robots.length} totais</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
                  <Bot className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tickets Trend */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Chamados - Últimos 7 Dias
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Abertura vs Resolução</p>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ticketsTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="day" stroke="#9ca3af" style={{ fontSize: '12px' }} />
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
                  <Bar dataKey="opened" name="Abertos" fill="#3b82f6" />
                  <Bar dataKey="resolved" name="Resolvidos" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Equipment Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Distribuição de Equipamentos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Por tipo de equipamento</p>
              </div>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={equipmentByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {equipmentByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {equipmentByType.map((item, index) => (
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
            {/* Critical Tickets */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Chamados Críticos
                </h3>
                <button 
                  onClick={() => setActiveTab('tickets')}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  Ver todos
                </button>
              </div>
              <div className="space-y-3">
                {tickets.filter(t => (t.priority === 'critical' || t.priority === 'high') && t.status !== 'resolved').map((ticket) => {
                  const StatusIcon = ticketStatusConfig[ticket.status].icon;
                  return (
                    <div key={ticket.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{ticket.title}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {ticket.requester} • {ticket.department}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ticketStatusConfig[ticket.status].color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-medium ${priorityConfig[ticket.priority].color}`}>
                          {priorityConfig[ticket.priority].label}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {ticket.category}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Estoque Baixo
                </h3>
                <button 
                  onClick={() => setActiveTab('stock')}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  Ver estoque
                </button>
              </div>
              <div className="space-y-3">
                {stockItems.filter(s => s.quantity <= s.minQuantity).map((item) => (
                  <div key={item.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{item.category}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.quantity < item.minQuantity ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                        'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                      }`}>
                        {item.quantity < item.minQuantity ? 'Crítico' : 'Baixo'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">
                        Qtd: {item.quantity} / Mín: {item.minQuantity}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {item.location}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Departamento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Cargo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Permissões</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Último Acesso</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {systemUsers.map((user) => {
                    const StatusIcon = statusConfig[user.status].icon;
                    return (
                      <tr
                        key={user.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{user.department}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{user.position}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-gray-600 dark:text-gray-400">{user.permissions.length} permissões</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[user.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[user.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {user.lastAccess ? (
                            <p className="text-sm text-gray-900 dark:text-white">{formatDate(user.lastAccess)}</p>
                          ) : (
                            <p className="text-sm text-gray-500">Nunca</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-md transition-colors">
                              <Edit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </button>
                            <button className="p-1.5 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-md transition-colors">
                              <Key className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
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

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Equipamento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Serial</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Alocado Para</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Localização</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Garantia</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((item) => {
                    const StatusIcon = statusConfig[item.status].icon;
                    return (
                      <tr
                        key={item.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{item.brand} {item.model}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-mono">{item.serialNumber}</p>
                        </td>
                        <td className="px-6 py-4">
                          {item.assignedTo ? (
                            <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {item.assignedTo}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {item.location}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[item.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[item.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {item.warrantyUntil ? (
                            <p className="text-sm text-gray-900 dark:text-white">{formatDate(item.warrantyUntil)}</p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-md transition-colors">
                              <Edit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </button>
                            <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stockItems.map((item) => (
              <div 
                key={item.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-6 hover:shadow-lg transition-all cursor-pointer ${
                  item.quantity < item.minQuantity ? 'border-red-300 dark:border-red-600' :
                  item.quantity === item.minQuantity ? 'border-yellow-300 dark:border-yellow-600' :
                  'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{item.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{item.category}</p>
                  </div>
                  {item.quantity <= item.minQuantity && (
                    <AlertTriangle className={`w-5 h-5 ${
                      item.quantity < item.minQuantity ? 'text-red-600' : 'text-yellow-600'
                    }`} />
                  )}
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Quantidade:</span>
                    <span className={`text-lg font-bold ${
                      item.quantity < item.minQuantity ? 'text-red-600' :
                      item.quantity === item.minQuantity ? 'text-yellow-600' :
                      'text-gray-900 dark:text-white'
                    }`}>
                      {item.quantity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Mínimo:</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{item.minQuantity}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Valor Unit.:</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(item.unitPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Valor Total:</span>
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
                    <MapPin className="w-3 h-3" />
                    <span>{item.location}</span>
                  </div>
                  {item.lastEntry && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <ArrowUpRight className="w-3 h-3 text-green-600" />
                      <span>Entrada: {formatDate(item.lastEntry)}</span>
                    </div>
                  )}
                  {item.lastExit && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <ArrowDownRight className="w-3 h-3 text-red-600" />
                      <span>Saída: {formatDate(item.lastExit)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terms Tab */}
      {activeTab === 'terms' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Equipamento</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Gerado Em</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Assinado Em</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {terms.map((term) => {
                    const StatusIcon = termStatusConfig[term.status].icon;
                    return (
                      <tr
                        key={term.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                            {term.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{term.user}</p>
                        </td>
                        <td className="px-6 py-4">
                          {term.equipment ? (
                            <p className="text-sm text-gray-900 dark:text-white">{term.equipment}</p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{formatDate(term.generatedAt)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {term.signedAt ? (
                            <p className="text-sm text-gray-900 dark:text-white">{formatDate(term.signedAt)}</p>
                          ) : (
                            <p className="text-sm text-gray-500">-</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${termStatusConfig[term.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {termStatusConfig[term.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            {term.pdfUrl && (
                              <button className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                                <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              </button>
                            )}
                            {term.status === 'pending' && (
                              <button className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-md transition-colors">
                                <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
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

      {/* Tickets Tab */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto u-scrollbar-system">
              <table className="w-full border-separate border-spacing-y-2 px-2">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Chamado</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Solicitante</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Prioridade</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Responsável</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const StatusIcon = ticketStatusConfig[ticket.status].icon;
                    return (
                      <tr
                        key={ticket.id}
                        className="[&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:bg-white dark:[&>td]:bg-gray-800 [&>td]:border-y [&>td]:border-gray-200 dark:[&>td]:border-gray-700 [&>td:first-child]:border-l [&>td:last-child]:border-r hover:[&>td]:bg-gray-50 dark:hover:[&>td]:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{ticket.title}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-xs truncate">{ticket.description}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white">{ticket.requester}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{ticket.department}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium capitalize">
                            {ticket.type === 'incident' && 'Incidente'}
                            {ticket.type === 'request' && 'Requisição'}
                            {ticket.type === 'change' && 'Mudança'}
                            {ticket.type === 'problem' && 'Problema'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                            {ticket.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-medium ${priorityConfig[ticket.priority].color}`}>
                            {priorityConfig[ticket.priority].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ticketStatusConfig[ticket.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {ticketStatusConfig[ticket.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {ticket.assignee ? (
                            <p className="text-sm text-gray-900 dark:text-white">{ticket.assignee}</p>
                          ) : (
                            <p className="text-sm text-gray-500">Não atribuído</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors">
                              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
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

      {/* Robots Tab */}
      {activeTab === 'robots' && (
        <div className="space-y-6">
          <div className="space-y-4">
            {robots.map((robot) => {
              const StatusIcon = statusConfig[robot.status]?.icon || Bot;
              
              return (
                <div 
                  key={robot.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-lg ${
                      robot.type === 'Backup' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                      robot.type === 'Relatório' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                      robot.type === 'Integração' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                      robot.type === 'Manutenção' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                      'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                    } flex items-center justify-center flex-shrink-0`}>
                      <Bot className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{robot.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{robot.description}</p>
                        </div>
                        <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors">
                          <MoreVertical className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Tipo</p>
                          <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-xs font-medium">
                            {robot.type}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Agendamento</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{robot.schedule}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Última Execução</p>
                          <p className="text-sm text-gray-900 dark:text-white">{robot.lastRun || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Próxima Execução</p>
                          <p className="text-sm text-gray-900 dark:text-white">{robot.nextRun || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig[robot.status].color} flex items-center gap-1 w-fit`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig[robot.status].label}
                          </span>
                        </div>
                      </div>

                      {/* Success Rate Progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 dark:text-gray-400">Taxa de Sucesso</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">{robot.successRate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all ${
                              robot.successRate >= 98 ? 'bg-green-500' :
                              robot.successRate >= 95 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${robot.successRate}%` }}
                          />
                        </div>
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
