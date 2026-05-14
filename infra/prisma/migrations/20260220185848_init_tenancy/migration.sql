/*
  Warnings:

  - Added the required column `organization_id` to the `agenda` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `agenda.recurring` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `budgets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `certificate.pf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `certificate.pj` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `chats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `chats.messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `chats.participants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clientes.clouds` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.clientsGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.documentTermination` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.group` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.history` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.historyPending` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.pa` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.pf` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `clients.termination` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `contabil.control` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `contabil.relationship` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `contabil.responsibles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `departments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `emails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `fiscal.icms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `fiscal.ipi` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `fiscal.ncm` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.projectPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.projectPlanTasks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.projects` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.tasks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.tasksDependent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.tasksIntegrationRegularize` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `integracao.tasksModel` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `logs.pessoal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `mtk.passwords` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `notes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `notification.certificate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `notification.pessoal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `notification.regularize` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `parcelamento.installments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `parcelamento.installmentsCompetencies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `parcelamento.panorama` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `permissions.project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `permissions.specific` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.ldd` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.obrigations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.passwords` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.payroll` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.situations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `pessoal.union` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `proposal.config` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.license` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.municipalTaxes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.partners` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.passowordsSites` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.passwordsRegularize` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.proceduralGuidances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `regularize.process` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.allergies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.colaborators` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.emergencyContacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.holidays` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.pointConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.points` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.request_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.request_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.score` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.score_evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.score_nitro` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.score_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.timeBankReleases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.timeClockRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `rh.timeSheets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `stock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `stock.categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `stock.entries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `stock.exits` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `stock.locations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.extensions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.inventory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.inventoryCategories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.inventoryLocations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.passwords_users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.request_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.request_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.requests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `tecnologia.terms` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `triagem.configs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `triagem.monthly` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `triagem.responsibles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organization_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agenda" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "agenda.recurring" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "certificate.pf" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "certificate.pj" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "chats.messages" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "chats.participants" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clientes.clouds" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.clientsGroup" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.documentTermination" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.group" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.history" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.historyPending" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.pa" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.pf" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clients.termination" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "contabil.control" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "contabil.relationship" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "contabil.responsibles" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "fiscal.icms" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "fiscal.ipi" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "fiscal.ncm" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.projectPlan" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.projectPlanTasks" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.projects" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.tasks" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.tasksDependent" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.tasksIntegrationRegularize" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "integracao.tasksModel" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "logs" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "logs.pessoal" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "mtk.passwords" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notification.certificate" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notification.pessoal" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "notification.regularize" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "parcelamento.installments" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "parcelamento.installmentsCompetencies" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "parcelamento.panorama" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "permissions.project" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "permissions.specific" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.ldd" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.obrigations" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.passwords" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.payroll" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.situations" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pessoal.union" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "proposal.config" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.license" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.municipalTaxes" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.partners" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.passowordsSites" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.passwordsRegularize" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.proceduralGuidances" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "regularize.process" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.allergies" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.colaborators" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.emergencyContacts" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.holidays" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.pointConfig" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.points" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.request_categories" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.request_messages" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.requests" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.score" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.score_evaluations" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.score_nitro" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.score_questions" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.timeBankReleases" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.timeClockRequest" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "rh.timeSheets" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock.categories" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock.entries" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock.exits" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock.locations" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.extensions" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.inventory" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.inventoryCategories" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.inventoryLocations" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.passwords_users" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.request_categories" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.request_messages" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.requests" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "tecnologia.terms" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "triagem.configs" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "triagem.monthly" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "triagem.responsibles" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "organization_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions.specific" ADD CONSTRAINT "permissions.specific_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions.project" ADD CONSTRAINT "permissions.project_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs" ADD CONSTRAINT "logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs.pessoal" ADD CONSTRAINT "logs.pessoal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification.certificate" ADD CONSTRAINT "notification.certificate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification.pessoal" ADD CONSTRAINT "notification.pessoal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification.regularize" ADD CONSTRAINT "notification.regularize_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats.participants" ADD CONSTRAINT "chats.participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats.messages" ADD CONSTRAINT "chats.messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.pa" ADD CONSTRAINT "clients.pa_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.history" ADD CONSTRAINT "clients.history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.historyPending" ADD CONSTRAINT "clients.historyPending_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.group" ADD CONSTRAINT "clients.group_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.clientsGroup" ADD CONSTRAINT "clients.clientsGroup_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.termination" ADD CONSTRAINT "clients.termination_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.documentTermination" ADD CONSTRAINT "clients.documentTermination_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.pf" ADD CONSTRAINT "clients.pf_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksModel" ADD CONSTRAINT "integracao.tasksModel_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksDependent" ADD CONSTRAINT "integracao.tasksDependent_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projectPlan" ADD CONSTRAINT "integracao.projectPlan_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projectPlanTasks" ADD CONSTRAINT "integracao.projectPlanTasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.projects" ADD CONSTRAINT "integracao.projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasks" ADD CONSTRAINT "integracao.tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal.config" ADD CONSTRAINT "proposal.config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda.recurring" ADD CONSTRAINT "agenda.recurring_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.locations" ADD CONSTRAINT "stock.locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.categories" ADD CONSTRAINT "stock.categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.entries" ADD CONSTRAINT "stock.entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate.pj" ADD CONSTRAINT "certificate.pj_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate.pf" ADD CONSTRAINT "certificate.pf_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.control" ADD CONSTRAINT "contabil.control_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.responsibles" ADD CONSTRAINT "contabil.responsibles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.relationship" ADD CONSTRAINT "contabil.relationship_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal.ncm" ADD CONSTRAINT "fiscal.ncm_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal.icms" ADD CONSTRAINT "fiscal.icms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal.ipi" ADD CONSTRAINT "fiscal.ipi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mtk.passwords" ADD CONSTRAINT "mtk.passwords_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.installments" ADD CONSTRAINT "parcelamento.installments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.installmentsCompetencies" ADD CONSTRAINT "parcelamento.installmentsCompetencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.panorama" ADD CONSTRAINT "parcelamento.panorama_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.ldd" ADD CONSTRAINT "pessoal.ldd_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.passwords" ADD CONSTRAINT "pessoal.passwords_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.union" ADD CONSTRAINT "pessoal.union_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.payroll" ADD CONSTRAINT "pessoal.payroll_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.obrigations" ADD CONSTRAINT "pessoal.obrigations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.situations" ADD CONSTRAINT "pessoal.situations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.passowordsSites" ADD CONSTRAINT "regularize.passowordsSites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.passwordsRegularize" ADD CONSTRAINT "regularize.passwordsRegularize_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.license" ADD CONSTRAINT "regularize.license_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.proceduralGuidances" ADD CONSTRAINT "regularize.proceduralGuidances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.partners" ADD CONSTRAINT "regularize.partners_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.municipalTaxes" ADD CONSTRAINT "regularize.municipalTaxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integracao.tasksIntegrationRegularize" ADD CONSTRAINT "integracao.tasksIntegrationRegularize_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.colaborators" ADD CONSTRAINT "rh.colaborators_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.emergencyContacts" ADD CONSTRAINT "rh.emergencyContacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.allergies" ADD CONSTRAINT "rh.allergies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.pointConfig" ADD CONSTRAINT "rh.pointConfig_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeSheets" ADD CONSTRAINT "rh.timeSheets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeBankReleases" ADD CONSTRAINT "rh.timeBankReleases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.points" ADD CONSTRAINT "rh.points_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.timeClockRequest" ADD CONSTRAINT "rh.timeClockRequest_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.holidays" ADD CONSTRAINT "rh.holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score" ADD CONSTRAINT "rh.score_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_nitro" ADD CONSTRAINT "rh.score_nitro_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_questions" ADD CONSTRAINT "rh.score_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.score_evaluations" ADD CONSTRAINT "rh.score_evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.requests" ADD CONSTRAINT "rh.requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.request_categories" ADD CONSTRAINT "rh.request_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rh.request_messages" ADD CONSTRAINT "rh.request_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.passwords_users" ADD CONSTRAINT "tecnologia.passwords_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.extensions" ADD CONSTRAINT "tecnologia.extensions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventoryCategories" ADD CONSTRAINT "tecnologia.inventoryCategories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventoryLocations" ADD CONSTRAINT "tecnologia.inventoryLocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventory" ADD CONSTRAINT "tecnologia.inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.terms" ADD CONSTRAINT "tecnologia.terms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.requests" ADD CONSTRAINT "tecnologia.requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.request_categories" ADD CONSTRAINT "tecnologia.request_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.request_messages" ADD CONSTRAINT "tecnologia.request_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem.configs" ADD CONSTRAINT "triagem.configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem.monthly" ADD CONSTRAINT "triagem.monthly_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes.clouds" ADD CONSTRAINT "clientes.clouds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem.responsibles" ADD CONSTRAINT "triagem.responsibles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;