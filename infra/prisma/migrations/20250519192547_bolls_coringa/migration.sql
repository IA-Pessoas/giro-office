/*
  Warnings:

  - The `contabil` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `fiscal` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `pessoal` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `infoproduto` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `consultoria` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `castelo_med` column on the `clients` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "clients" DROP COLUMN "contabil",
ADD COLUMN     "contabil" BOOLEAN,
DROP COLUMN "fiscal",
ADD COLUMN     "fiscal" BOOLEAN,
DROP COLUMN "pessoal",
ADD COLUMN     "pessoal" BOOLEAN,
DROP COLUMN "infoproduto",
ADD COLUMN     "infoproduto" BOOLEAN,
DROP COLUMN "consultoria",
ADD COLUMN     "consultoria" BOOLEAN,
DROP COLUMN "castelo_med",
ADD COLUMN     "castelo_med" BOOLEAN;
