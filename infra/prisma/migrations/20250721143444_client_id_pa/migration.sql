-- AddForeignKey
ALTER TABLE "clients.pa" ADD CONSTRAINT "clients.pa_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
