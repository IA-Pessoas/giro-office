/*
  Warnings:

  - A unique constraint covering the columns `[client_id]` on the table `pessoal.payroll` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "pessoal.payroll_client_id_key" ON "pessoal.payroll"("client_id");
