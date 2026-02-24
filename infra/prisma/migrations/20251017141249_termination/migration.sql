-- CreateTable
CREATE TABLE "clients.termination" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "clients.termination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients.documentTermination" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "legal_representative_name" TEXT NOT NULL,
    "legal_representative_cpf" TEXT NOT NULL,
    "legal_representative_rg" TEXT NOT NULL,
    "third_clause_competence" TEXT NOT NULL,
    "fourh_clause_competence" TEXT NOT NULL,
    "sixth_clause_type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients.documentTermination_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clients.termination" ADD CONSTRAINT "clients.termination_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.documentTermination" ADD CONSTRAINT "clients.documentTermination_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
