-- CreateTable
CREATE TABLE "pessoal.ldd" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "balance_amount" DOUBLE PRECISION NOT NULL,
    "registration_status" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "pessoal.ldd_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pessoal.ldd" ADD CONSTRAINT "pessoal.ldd_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
