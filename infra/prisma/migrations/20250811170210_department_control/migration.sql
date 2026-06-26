-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_department_control_id_fkey" FOREIGN KEY ("department_control_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
