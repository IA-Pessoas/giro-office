import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../services/src/src/generated/prisma/client.js";

// Carregar .env da raiz do workspace
// infra/prisma/seed.ts -> workspace/.env (2 níveis acima)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, '../../.env');

// Tenta carregar da raiz do workspace
let envLoaded = false;
const result1 = dotenv.config({ path: rootEnvPath });
if (result1.parsed) {
    console.log('✅ .env carregado de:', rootEnvPath);
    envLoaded = true;
} else {
    // Fallback: tenta do diretório atual
    const cwdEnvPath = path.resolve(process.cwd(), '.env');
    const result2 = dotenv.config({ path: cwdEnvPath });
    if (result2.parsed) {
        console.log('✅ .env carregado de:', cwdEnvPath);
        envLoaded = true;
    } else {
        // Fallback final
        dotenv.config();
    }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL não encontrada. Procurando em:', rootEnvPath);
  throw new Error("DATABASE_URL is not set");
}
const adapter = new PrismaPg({
  connectionString,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...\n");

  // =============================================================
  // 1. CRIAR ORGANIZAÇÃO PRINCIPAL
  // =============================================================
  const organization = await prisma.organization.upsert({
    where: { slug: "castelo-contabilidade" },
    update: {},
    create: {
      name: "Castelo Contabilidade",
      slug: "castelo-contabilidade",
      logo_url: null,
      status: "active",
      email_created_by: "admin@castelo.com",
      cnpj: "00000000000000",
      subscription_plan: "trial",
    },
  });

  console.log("✅ Organização criada:", organization.name);

  // =============================================================
  // 2. CRIAR DEPARTAMENTOS
  // =============================================================
  const departmentsData = [
    { id: "dept-admin", name: "Administração", color: "#6B7280", solution: false },
    { id: "dept-contabil", name: "Contábil", color: "#3B82F6", solution: true },
    { id: "dept-fiscal", name: "Fiscal", color: "#10B981", solution: true },
    { id: "dept-pessoal", name: "Pessoal", color: "#F59E0B", solution: true },
    { id: "dept-rh", name: "Recursos Humanos", color: "#EC4899", solution: false },
    { id: "dept-ti", name: "Tecnologia", color: "#8B5CF6", solution: false },
    { id: "dept-comercial", name: "Comercial", color: "#EF4444", solution: false },
    { id: "dept-financeiro", name: "Financeiro", color: "#14B8A6", solution: false },
  ];

  const departments: Record<string, unknown> = {};

  for (const dept of departmentsData) {
    const created = await prisma.department.upsert({
      where: { id: dept.id },
      update: {},
      create: {
        id: dept.id,
        organization_id: organization.id,
        name: dept.name,
        color: dept.color,
        status: "active",
        solution: dept.solution,
      },
    });
    departments[dept.id] = created;
  }

  console.log(`✅ ${departmentsData.length} Departamentos criados`);

  // =============================================================
  // 3. CRIAR USUÁRIOS
  // =============================================================
  const usersData = [
    {
      id: "user-admin",
      name: "Administrador",
      login: "admin",
      permission: 999,
      dept: "dept-admin",
    },
    {
      id: "user-gerente",
      name: "Maria Gerente",
      login: "maria.gerente",
      permission: 500,
      dept: "dept-admin",
    },
    {
      id: "user-contabil1",
      name: "João Contador",
      login: "joao.contador",
      permission: 100,
      dept: "dept-contabil",
    },
    {
      id: "user-contabil2",
      name: "Ana Contadora",
      login: "ana.contadora",
      permission: 100,
      dept: "dept-contabil",
    },
    {
      id: "user-fiscal1",
      name: "Carlos Fiscal",
      login: "carlos.fiscal",
      permission: 100,
      dept: "dept-fiscal",
    },
    {
      id: "user-pessoal1",
      name: "Fernanda Pessoal",
      login: "fernanda.pessoal",
      permission: 100,
      dept: "dept-pessoal",
    },
    { id: "user-rh1", name: "Roberto RH", login: "roberto.rh", permission: 100, dept: "dept-rh" },
    { id: "user-ti1", name: "Lucas TI", login: "lucas.ti", permission: 100, dept: "dept-ti" },
    {
      id: "user-comercial1",
      name: "Patrícia Comercial",
      login: "patricia.comercial",
      permission: 100,
      dept: "dept-comercial",
    },
  ];

  const users: Record<string, unknown> = {};
  const hashedPassword = await bcrypt.hash("senha123", 8);

  for (const user of usersData) {
    const created = await prisma.user.upsert({
      where: { id: user.id },
      update: { password: hashedPassword },
      create: {
        id: user.id,
        organization_id: organization.id,
        department_id: user.dept,
        name: user.name,
        login: user.login,
        password: hashedPassword,
        permission: user.permission,
        status: "active",
        photo_url: null,
      },
    });
    users[user.id] = created;
  }

  console.log(`✅ ${usersData.length} Usuários criados`);

  // =============================================================
  // 4. CRIAR PERMISSÕES PARA USUÁRIOS
  // =============================================================
  const permissionsData = [
    {
      userId: "user-admin",
      atendimento: 3,
      certificado: 3,
      comercial: 3,
      contabil: 3,
      financeiro: 3,
      fiscal: 3,
      integracao: 3,
      marketing: 3,
      parcelamento: 3,
      pec: 3,
      pessoal: 3,
      regularize: 3,
      rh: 3,
      triagem: 3,
      wiki: 3,
    },
    {
      userId: "user-gerente",
      atendimento: 2,
      certificado: 2,
      comercial: 2,
      contabil: 2,
      financeiro: 2,
      fiscal: 2,
      integracao: 2,
      marketing: 2,
      parcelamento: 2,
      pec: 2,
      pessoal: 2,
      regularize: 2,
      rh: 2,
      triagem: 2,
      wiki: 2,
    },
    {
      userId: "user-contabil1",
      atendimento: 1,
      certificado: 1,
      comercial: 0,
      contabil: 3,
      financeiro: 1,
      fiscal: 1,
      integracao: 1,
      marketing: 0,
      parcelamento: 1,
      pec: 0,
      pessoal: 0,
      regularize: 0,
      rh: 0,
      triagem: 2,
      wiki: 1,
    },
    {
      userId: "user-fiscal1",
      atendimento: 1,
      certificado: 1,
      comercial: 0,
      contabil: 1,
      financeiro: 1,
      fiscal: 3,
      integracao: 1,
      marketing: 0,
      parcelamento: 1,
      pec: 0,
      pessoal: 0,
      regularize: 1,
      rh: 0,
      triagem: 2,
      wiki: 1,
    },
    {
      userId: "user-pessoal1",
      atendimento: 1,
      certificado: 1,
      comercial: 0,
      contabil: 0,
      financeiro: 0,
      fiscal: 0,
      integracao: 1,
      marketing: 0,
      parcelamento: 0,
      pec: 0,
      pessoal: 3,
      regularize: 0,
      rh: 1,
      triagem: 0,
      wiki: 1,
    },
  ];

  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { id: `perm-${perm.userId}` },
      update: {},
      create: {
        id: `perm-${perm.userId}`,
        organization_id: organization.id,
        user_id: perm.userId,
        atendimento: perm.atendimento,
        certificado: perm.certificado,
        comercial: perm.comercial,
        contabil: perm.contabil,
        financeiro: perm.financeiro,
        fiscal: perm.fiscal,
        integracao: perm.integracao,
        marketing: perm.marketing,
        parcelamento: perm.parcelamento,
        pec: perm.pec,
        pessoal: perm.pessoal,
        regularize: perm.regularize,
        rh: perm.rh,
        triagem: perm.triagem,
        wiki: perm.wiki,
      },
    });
  }

  console.log(`✅ ${permissionsData.length} Permissões criadas`);

  // =============================================================
  // 5. CRIAR CLIENTES FICTÍCIOS
  // =============================================================
  const clientsData = [
    {
      id: "client-001",
      name: "Tech Solutions Ltda",
      cpf_cnpj: "12.345.678/0001-90",
      type: "PJ",
      segment: "Tecnologia",
    },
    {
      id: "client-002",
      name: "Comércio ABC Ltda",
      cpf_cnpj: "23.456.789/0001-01",
      type: "PJ",
      segment: "Comércio",
    },
    {
      id: "client-003",
      name: "Restaurante Sabor & Arte",
      cpf_cnpj: "34.567.890/0001-12",
      type: "PJ",
      segment: "Alimentação",
    },
    {
      id: "client-004",
      name: "Clínica Saúde Total",
      cpf_cnpj: "45.678.901/0001-23",
      type: "PJ",
      segment: "Saúde",
    },
    {
      id: "client-005",
      name: "Construtora Horizonte",
      cpf_cnpj: "56.789.012/0001-34",
      type: "PJ",
      segment: "Construção",
    },
    {
      id: "client-006",
      name: "João da Silva MEI",
      cpf_cnpj: "123.456.789-00",
      type: "PF",
      segment: "Serviços",
    },
    {
      id: "client-007",
      name: "Advocacia Santos & Associados",
      cpf_cnpj: "67.890.123/0001-45",
      type: "PJ",
      segment: "Jurídico",
    },
    {
      id: "client-008",
      name: "Padaria Pão Quente",
      cpf_cnpj: "78.901.234/0001-56",
      type: "PJ",
      segment: "Alimentação",
    },
  ];

  const clients: Record<string, unknown> = {};

  for (const client of clientsData) {
    const created = await prisma.client.upsert({
      where: { id: client.id },
      update: {},
      create: {
        id: client.id,
        organization_id: organization.id,
        name: client.name,
        cpf_cnpj: client.cpf_cnpj,
        type: client.type,
        status: "active",
        prospecting_status: "cliente",
        segment: client.segment,
        contabil: true,
        fiscal: true,
        pessoal: client.type === "PJ",
      },
    });
    clients[client.id] = created;
  }

  console.log(`✅ ${clientsData.length} Clientes criados`);

  // =============================================================
  // 6. CRIAR MODELOS DE TAREFA
  // =============================================================
  const taskModelsData = [
    {
      id: "model-abertura",
      name: "Abertura de Empresa",
      dept: "dept-contabil",
      billing: "Único",
      prevision: 30,
    },
    {
      id: "model-balanco",
      name: "Balanço Patrimonial",
      dept: "dept-contabil",
      billing: "Mensal",
      prevision: 15,
    },
    {
      id: "model-apuracao",
      name: "Apuração de Impostos",
      dept: "dept-fiscal",
      billing: "Mensal",
      prevision: 10,
    },
    {
      id: "model-folha",
      name: "Folha de Pagamento",
      dept: "dept-pessoal",
      billing: "Mensal",
      prevision: 5,
    },
    {
      id: "model-admissao",
      name: "Admissão de Funcionário",
      dept: "dept-pessoal",
      billing: "Avulso",
      prevision: 3,
    },
    {
      id: "model-alvara",
      name: "Renovação de Alvará",
      dept: "dept-fiscal",
      billing: "Anual",
      prevision: 20,
    },
  ];

  const taskModels: Record<string, unknown> = {};

  for (const model of taskModelsData) {
    const created = await prisma.taskModel.upsert({
      where: { id: model.id },
      update: {},
      create: {
        id: model.id,
        organization_id: organization.id,
        name: model.name,
        department_id: model.dept,
        responsible_id: "user-admin",
        billing: model.billing,
        prevision: model.prevision,
        type: "Padrão",
      },
    });
    taskModels[model.id] = created;
  }

  console.log(`✅ ${taskModelsData.length} Modelos de Tarefa criados`);

  // =============================================================
  // 7. CRIAR PROJETOS
  // =============================================================
  const projectsData = [
    {
      id: "proj-001",
      name: "Onboarding Tech Solutions",
      clientId: "client-001",
      status: "Em Andamento",
    },
    {
      id: "proj-002",
      name: "Regularização Comércio ABC",
      clientId: "client-002",
      status: "Em Andamento",
    },
    {
      id: "proj-003",
      name: "Abertura Restaurante Sabor & Arte",
      clientId: "client-003",
      status: "Concluído",
    },
    {
      id: "proj-004",
      name: "Contabilidade Mensal - Clínica Saúde",
      clientId: "client-004",
      status: "Em Andamento",
    },
  ];

  const projects: Record<string, unknown> = {};

  for (const proj of projectsData) {
    const created = await prisma.project.upsert({
      where: { id: proj.id },
      update: {},
      create: {
        id: proj.id,
        organization_id: organization.id,
        name: proj.name,
        client_id: proj.clientId,
        status: proj.status,
        porcentage: proj.status === "Concluído" ? 100 : Math.floor(Math.random() * 80),
        start_date: new Date("2025-01-15"),
        sponsor_id: "user-gerente",
      },
    });
    projects[proj.id] = created;
  }

  console.log(`✅ ${projectsData.length} Projetos criados`);

  // =============================================================
  // 8. CRIAR TAREFAS
  // =============================================================
  const tasksData = [
    {
      id: "task-001",
      name: "Contrato Social",
      projectId: "proj-001",
      clientId: "client-001",
      modelId: "model-abertura",
      dept: "dept-contabil",
      responsible: "user-contabil1",
      status: "Concluída",
      urgency: "Normal",
    },
    {
      id: "task-002",
      name: "Registro na Junta Comercial",
      projectId: "proj-001",
      clientId: "client-001",
      modelId: "model-abertura",
      dept: "dept-contabil",
      responsible: "user-contabil1",
      status: "Em Andamento",
      urgency: "Normal",
    },
    {
      id: "task-003",
      name: "Inscrição Estadual",
      projectId: "proj-001",
      clientId: "client-001",
      modelId: "model-abertura",
      dept: "dept-fiscal",
      responsible: "user-fiscal1",
      status: "Pendente",
      urgency: "Normal",
    },
    {
      id: "task-004",
      name: "Apuração ICMS Janeiro",
      projectId: "proj-002",
      clientId: "client-002",
      modelId: "model-apuracao",
      dept: "dept-fiscal",
      responsible: "user-fiscal1",
      status: "Em Andamento",
      urgency: "Alta",
    },
    {
      id: "task-005",
      name: "Folha de Pagamento Janeiro",
      projectId: "proj-004",
      clientId: "client-004",
      modelId: "model-folha",
      dept: "dept-pessoal",
      responsible: "user-pessoal1",
      status: "Concluída",
      urgency: "Normal",
    },
    {
      id: "task-006",
      name: "Balanço Q4 2024",
      projectId: "proj-003",
      clientId: "client-003",
      modelId: "model-balanco",
      dept: "dept-contabil",
      responsible: "user-contabil2",
      status: "Concluída",
      urgency: "Normal",
    },
    {
      id: "task-007",
      name: "Admissão Novo Funcionário",
      projectId: "proj-004",
      clientId: "client-004",
      modelId: "model-admissao",
      dept: "dept-pessoal",
      responsible: "user-pessoal1",
      status: "Pendente",
      urgency: "Urgente",
    },
  ];

  for (const task of tasksData) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: {
        id: task.id,
        organization_id: organization.id,
        name: task.name,
        project_id: task.projectId,
        client_id: task.clientId,
        model_id: task.modelId,
        department_id: task.dept,
        responsible_id: task.responsible,
        status: task.status,
        urgency: task.urgency,
        billing: "Mensal",
        start_date: new Date("2025-01-10"),
        prevision_date: new Date("2025-02-10"),
        end_date: task.status === "Concluída" ? new Date("2025-01-25") : null,
      },
    });
  }

  console.log(`✅ ${tasksData.length} Tarefas criadas`);

  // =============================================================
  // RESUMO FINAL
  // =============================================================
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Seed concluído com sucesso!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📋 Dados criados:");
  console.log(`   • 1 Organization: ${organization.name}`);
  console.log(`   • ${departmentsData.length} Departments`);
  console.log(`   • ${usersData.length} Users`);
  console.log(`   • ${permissionsData.length} Permissions`);
  console.log(`   • ${clientsData.length} Clients`);
  console.log(`   • ${taskModelsData.length} Task Models`);
  console.log(`   • ${projectsData.length} Projects`);
  console.log(`   • ${tasksData.length} Tasks`);
  console.log("");
  console.log("🔐 Credenciais de teste:");
  console.log("   • Admin:    login: admin           senha: senha123");
  console.log("   • Gerente:  login: maria.gerente   senha: senha123");
  console.log("   • Contábil: login: joao.contador   senha: senha123");
  console.log("");
  console.log("⚠️  Lembre-se de usar hash nas senhas em produção!");
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Erro durante o seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
