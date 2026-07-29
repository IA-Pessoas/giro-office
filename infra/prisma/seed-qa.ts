import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client.js";
import {
  INTEGRACAO_QA_FIXTURES,
  INTEGRACAO_QA_PASSWORD,
} from "../../scripts/qa/integracao-fixtures.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

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

function buildPermissionModules(level: number): Record<string, number> {
  return Object.fromEntries(
    permissionModuleNames.map((moduleName) => [moduleName, moduleName === "integracao" ? level : 0]),
  );
}

async function seedPermission(
  userId: string,
  organizationId: string,
  level: number,
): Promise<void> {
  const data = {
    user_id: userId,
    organization_id: organizationId,
    ...buildPermissionModules(level),
  };
  const existing = await prisma.permission.findFirst({
    where: { user_id: userId, organization_id: organizationId },
    select: { id: true },
  });

  if (existing) {
    await prisma.permission.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.permission.create({ data });
}

async function seedFixture(fixture: (typeof INTEGRACAO_QA_FIXTURES)[number]): Promise<void> {
  const { organization, department } = fixture;
  const organizationData = {
    name: organization.name,
    slug: organization.slug,
    logo_url: null,
    status: "active" as const,
    email_created_by: organization.emailCreatedBy,
    cnpj: organization.cnpj,
    subscription_plan: "trial",
  };

  await prisma.organization.upsert({
    where: { id: organization.id },
    update: organizationData,
    create: { id: organization.id, ...organizationData },
  });

  await prisma.department.upsert({
    where: { id: department.id },
    update: { organization_id: organization.id, name: department.name },
    create: {
      id: department.id,
      organization_id: organization.id,
      name: department.name,
      color: "#2563EB",
      status: "active",
      solution: false,
    },
  });

  const password = await bcrypt.hash(INTEGRACAO_QA_PASSWORD, 8);
  for (const user of fixture.users) {
    const userType = user.type === "owner" ? "owner" : "user";
    const permissionLevel = user.type === "owner" ? 0 : user.level;

    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        organization_id: organization.id,
        department_id: department.id,
        name: user.name,
        login: user.login,
        password,
        permission: 0,
        type: userType,
        first_owner_flag: user.type === "owner",
        status: "active",
      },
      create: {
        id: user.id,
        organization_id: organization.id,
        department_id: department.id,
        name: user.name,
        login: user.login,
        password,
        permission: 0,
        type: userType,
        first_owner_flag: user.type === "owner",
        status: "active",
        photo_url: null,
      },
    });
    await seedPermission(user.id, organization.id, permissionLevel);
  }

  await prisma.client.upsert({
    where: { id: fixture.client.id },
    update: {
      organization_id: organization.id,
      name: fixture.client.name,
      cpf_cnpj: fixture.client.cpfCnpj,
      status: "active",
      prospecting_status: "cliente",
      type: "PJ",
      segment: "QA",
    },
    create: {
      id: fixture.client.id,
      organization_id: organization.id,
      name: fixture.client.name,
      cpf_cnpj: fixture.client.cpfCnpj,
      status: "active",
      prospecting_status: "cliente",
      type: "PJ",
      segment: "QA",
      contabil: true,
      fiscal: true,
      pessoal: true,
    },
  });

  await prisma.taskModel.upsert({
    where: { id: fixture.taskModel.id },
    update: {
      organization_id: organization.id,
      name: fixture.taskModel.name,
      department_id: department.id,
      responsible_id: fixture.users[3].id,
      billing: "Mensal",
      prevision: 5,
      type: "QA",
    },
    create: {
      id: fixture.taskModel.id,
      organization_id: organization.id,
      name: fixture.taskModel.name,
      department_id: department.id,
      responsible_id: fixture.users[3].id,
      billing: "Mensal",
      prevision: 5,
      type: "QA",
    },
  });

  await prisma.project.upsert({
    where: { id: fixture.project.id },
    update: {
      organization_id: organization.id,
      name: fixture.project.name,
      client_id: fixture.client.id,
      status: "Em Andamento",
      porcentage: fixture.project.percentage,
      start_date: new Date("2026-07-01"),
      sponsor_id: fixture.users[3].id,
    },
    create: {
      id: fixture.project.id,
      organization_id: organization.id,
      name: fixture.project.name,
      client_id: fixture.client.id,
      status: "Em Andamento",
      porcentage: fixture.project.percentage,
      start_date: new Date("2026-07-01"),
      sponsor_id: fixture.users[3].id,
    },
  });

  await prisma.task.upsert({
    where: { id: fixture.task.id },
    update: {
      organization_id: organization.id,
      project_id: fixture.project.id,
      client_id: fixture.client.id,
      model_id: fixture.taskModel.id,
      department_id: department.id,
      responsible_id: fixture.users[0].id,
      responsible2_id: fixture.users[1].id,
      responsible3_id: fixture.users[2].id,
      name: fixture.task.name,
      status: "Em Andamento",
      billing: "Mensal",
      urgency: "Normal",
    },
    create: {
      id: fixture.task.id,
      organization_id: organization.id,
      project_id: fixture.project.id,
      client_id: fixture.client.id,
      model_id: fixture.taskModel.id,
      department_id: department.id,
      responsible_id: fixture.users[0].id,
      responsible2_id: fixture.users[1].id,
      responsible3_id: fixture.users[2].id,
      name: fixture.task.name,
      status: "Em Andamento",
      billing: "Mensal",
      urgency: "Normal",
      start_date: new Date("2026-07-01"),
      prevision_date: new Date("2026-08-01"),
    },
  });

  console.log(`✅ Fixture QA criada: ${organization.slug}`);
}

async function main(): Promise<void> {
  console.log("🌱 Criando fixtures descartáveis da QA de Integração...");
  for (const fixture of INTEGRACAO_QA_FIXTURES) {
    await seedFixture(fixture);
  }
  console.log("🎉 Fixtures QA de Integração concluídas.");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Erro durante o seed QA:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
