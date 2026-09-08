import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { PrismaClient } from "../generated/prisma/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
/** O cliente do fixture base atende o cenário de texto; o segundo isola o cenário de arquivo,
 * porque um Modelo só admite uma Tarefa ativa por cliente. */
const CLIENT_IDS = [
  "34000000-0000-4000-8000-000000000001",
  "34000000-0000-4000-8000-000000000010",
];
const SECOND_CLIENT = {
  id: CLIENT_IDS[1],
  name: "Cliente QA Wizard B",
  cpfCnpj: "34000000000010",
};
const PASSWORD = "senha123";
/** Prefixo dos Projetos criados pelo runner de evidência; só eles podem ser apagados. */
const EVIDENCE_PROJECT_PREFIX = "QA #996";

const departments = [
  { id: "31000000-0000-4000-8000-000000000010", name: "Tributário QA", color: "#7C3AED" },
  { id: "31000000-0000-4000-8000-000000000011", name: "Fiscal QA", color: "#059669" },
  { id: "31000000-0000-4000-8000-000000000012", name: "Contábil QA", color: "#D97706" },
  { id: "31000000-0000-4000-8000-000000000013", name: "Jurídico QA", color: "#DC2626" },
  { id: "31000000-0000-4000-8000-000000000014", name: "Comercial QA", color: "#2563EB" },
];

const users = [
  {
    id: "32000000-0000-4000-8000-000000000010",
    name: "QA Tributário Raphael",
    login: "qa.tributario",
    departmentId: departments[0].id,
    eligible: true,
  },
  {
    id: "32000000-0000-4000-8000-000000000011",
    name: "QA Fiscal Adilio",
    login: "qa.fiscal",
    departmentId: departments[1].id,
    eligible: true,
  },
  {
    id: "32000000-0000-4000-8000-000000000012",
    // Sem liderança de RH de propósito: mantém uma Tarefa "Sem responsável" na evidência.
    name: "QA Contábil Sandrini",
    login: "qa.contabil",
    departmentId: departments[2].id,
    eligible: false,
  },
  {
    id: "32000000-0000-4000-8000-000000000013",
    name: "QA Jurídico Osana",
    login: "qa.juridico",
    departmentId: departments[3].id,
    eligible: true,
  },
  {
    id: "32000000-0000-4000-8000-000000000014",
    name: "QA Comercial Antonio",
    login: "qa.comercial",
    departmentId: departments[4].id,
    eligible: true,
  },
];

const taskModels = [
  {
    id: "36000000-0000-4000-8000-000000000010",
    name: "Planejamento tributário",
    departmentId: departments[0].id,
    responsibleId: users[0].id,
    prevision: 15,
  },
  {
    id: "36000000-0000-4000-8000-000000000011",
    name: "Análise de operações financeiras",
    departmentId: departments[1].id,
    responsibleId: users[1].id,
    prevision: 10,
  },
  {
    id: "36000000-0000-4000-8000-000000000012",
    name: "Coleta de certificado digital",
    departmentId: departments[2].id,
    responsibleId: users[2].id,
    prevision: 3,
  },
  {
    id: "36000000-0000-4000-8000-000000000013",
    name: "Termo de confidencialidade",
    departmentId: departments[3].id,
    responsibleId: users[3].id,
    prevision: 5,
  },
  {
    id: "36000000-0000-4000-8000-000000000014",
    name: "Proposta comercial",
    departmentId: departments[4].id,
    responsibleId: users[4].id,
    prevision: 7,
  },
  {
    // Nenhuma Ata cita este Modelo: ele só entra como dependência do planejamento, o que dá à
    // revisão final uma Tarefa de dependência para exibir.
    id: "36000000-0000-4000-8000-000000000015",
    name: "Acompanhamento pós-planejamento",
    departmentId: departments[0].id,
    responsibleId: users[0].id,
    prevision: 20,
  },
];

/** "Planejamento tributário" arrasta "Acompanhamento pós-planejamento" para o Projeto. */
const modelDependencies = [
  {
    id: "37000000-0000-4000-8000-000000000010",
    taskId: taskModels[0].id,
    dependentId: "36000000-0000-4000-8000-000000000015",
  },
];

const permissionModuleNames = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

/** `rh >= 3` é o que torna o usuário elegível como responsável de Tarefa no departamento. */
const RH_LEADERSHIP_LEVEL = 3;

async function seedPermission(userId: string, level: number, eligible: boolean): Promise<void> {
  const data = {
    user_id: userId,
    organization_id: ORGANIZATION_ID,
    ...Object.fromEntries(
      permissionModuleNames.map((moduleName) => [
        moduleName,
        moduleName === "integracao" ? level : 0,
      ]),
    ),
    rh: eligible ? RH_LEADERSHIP_LEVEL : 0,
  };
  const existing = await prisma.permission.findFirst({
    where: { user_id: userId, organization_id: ORGANIZATION_ID },
    select: { id: true },
  });
  if (existing) {
    await prisma.permission.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.permission.create({ data });
}

/**
 * Um Modelo só admite uma Tarefa ativa por cliente, então rodar a evidência duas vezes seguidas
 * esbarraria na própria regra do produto. A limpeza devolve o cliente de teste ao estado inicial,
 * e só alcança Projetos que o runner criou.
 */
async function resetEvidenceProjects(): Promise<void> {
  const projects = await prisma.project.findMany({
    where: {
      organization_id: ORGANIZATION_ID,
      client_id: { in: CLIENT_IDS },
      name: { startsWith: EVIDENCE_PROJECT_PREFIX },
    },
    select: { id: true },
  });
  if (projects.length === 0) return;

  const projectIds = projects.map(({ id }) => id);
  await prisma.task.deleteMany({
    where: { organization_id: ORGANIZATION_ID, project_id: { in: projectIds } },
  });
  await prisma.project.deleteMany({
    where: { organization_id: ORGANIZATION_ID, id: { in: projectIds } },
  });
  console.log(`🧹 ${projectIds.length} Projeto(s) de evidência removido(s) do cliente de teste.`);
}

async function main(): Promise<void> {
  console.log("🌱 Ampliando fixtures QA do wizard de Projetos...");
  await resetEvidenceProjects();

  const secondClient = {
    organization_id: ORGANIZATION_ID,
    name: SECOND_CLIENT.name,
    cpf_cnpj: SECOND_CLIENT.cpfCnpj,
    status: "active",
    prospecting_status: "cliente",
    type: "PJ",
    segment: "QA",
  };
  await prisma.client.upsert({
    where: { id: SECOND_CLIENT.id },
    update: secondClient,
    create: { ...secondClient, id: SECOND_CLIENT.id, contabil: true, fiscal: true, pessoal: true },
  });

  for (const department of departments) {
    const data = {
      organization_id: ORGANIZATION_ID,
      name: department.name,
      color: department.color,
      status: "Ativo",
      solution: false,
    };
    await prisma.department.upsert({
      where: { id: department.id },
      update: data,
      create: { id: department.id, ...data },
    });
  }

  const password = await argon2.hash(PASSWORD, {
    type: argon2.argon2id as 2,
    version: 0x13,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });

  for (const user of users) {
    const data = {
      organization_id: ORGANIZATION_ID,
      department_id: user.departmentId,
      name: user.name,
      login: user.login,
      password,
      permission: 0,
      type: "user" as const,
      first_owner_flag: false,
      status: "active",
    };
    await prisma.user.upsert({
      where: { id: user.id },
      update: data,
      create: { id: user.id, ...data, photo_url: null },
    });
    await seedPermission(user.id, 3, user.eligible);
  }

  for (const model of taskModels) {
    const data = {
      organization_id: ORGANIZATION_ID,
      name: model.name,
      department_id: model.departmentId,
      responsible_id: model.responsibleId,
      billing: "Mensal",
      prevision: model.prevision,
      type: "Projeto",
    };
    await prisma.taskModel.upsert({
      where: { id: model.id },
      update: data,
      create: { id: model.id, ...data },
    });
  }

  for (const dependency of modelDependencies) {
    const data = {
      organization_id: ORGANIZATION_ID,
      task_id: dependency.taskId,
      dependent_id: dependency.dependentId,
      wait: true,
      observation: "Dependência de QA do wizard de Projetos.",
    };
    await prisma.taskDependent.upsert({
      where: { id: dependency.id },
      update: data,
      create: { id: dependency.id, ...data },
    });
  }

  console.log(
    `🎉 QA wizard: ${departments.length} departamentos, ${users.length} responsáveis e ${taskModels.length} modelos.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("❌ Erro durante o seed QA do wizard:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
