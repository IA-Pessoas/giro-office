-- CreateTable
CREATE TABLE "pessoal.passwords" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "login_main" TEXT,
    "senha_main" TEXT,
    "login_secondary" TEXT,
    "senha_secondary" TEXT,
    "responsavel_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "pessoal.passwords_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pessoal.passwords" ADD CONSTRAINT "pessoal.passwords_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.passwords" ADD CONSTRAINT "pessoal.passwords_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
