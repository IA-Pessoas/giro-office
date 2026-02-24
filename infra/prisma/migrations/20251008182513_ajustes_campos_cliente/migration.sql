/*
  Warnings:

  - You are about to drop the column `cnpj` on the `clients` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clients" DROP COLUMN "cnpj",
ADD COLUMN     "cpf_cnpj" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'PJ',
ADD COLUMN     "type_registration" TEXT NOT NULL DEFAULT 'Novo';
