-- DropForeignKey
ALTER TABLE "pessoal.payroll" DROP CONSTRAINT "pessoal.payroll_union_id_fkey";

-- AddForeignKey
ALTER TABLE "pessoal.payroll" ADD CONSTRAINT "pessoal.payroll_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "pessoal.union"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
