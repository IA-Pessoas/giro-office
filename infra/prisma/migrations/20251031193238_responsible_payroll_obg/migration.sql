-- DropForeignKey
ALTER TABLE "pessoal.payroll" DROP CONSTRAINT "pessoal.payroll_responsible_id_fkey";

-- AlterTable
ALTER TABLE "pessoal.payroll" ALTER COLUMN "responsible_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "pessoal.payroll" ADD CONSTRAINT "pessoal.payroll_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
