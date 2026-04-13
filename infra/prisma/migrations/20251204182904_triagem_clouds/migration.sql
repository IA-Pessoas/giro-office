-- CreateTable
CREATE TABLE "clientes.clouds" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes.clouds_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clientes.clouds" ADD CONSTRAINT "clientes.clouds_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
