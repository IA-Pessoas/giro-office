/*
  Warnings:

  - The `advance` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `payroll` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `charges` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `assistance_fee` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `bem_mais` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `bsf` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `va` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `vt` column on the `pessoal.obrigations` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "pessoal.obrigations" DROP COLUMN "advance",
ADD COLUMN     "advance" BOOLEAN,
DROP COLUMN "payroll",
ADD COLUMN     "payroll" BOOLEAN,
DROP COLUMN "charges",
ADD COLUMN     "charges" BOOLEAN,
DROP COLUMN "assistance_fee",
ADD COLUMN     "assistance_fee" BOOLEAN,
DROP COLUMN "bem_mais",
ADD COLUMN     "bem_mais" BOOLEAN,
DROP COLUMN "bsf",
ADD COLUMN     "bsf" BOOLEAN,
DROP COLUMN "va",
ADD COLUMN     "va" BOOLEAN,
DROP COLUMN "vt",
ADD COLUMN     "vt" BOOLEAN;
