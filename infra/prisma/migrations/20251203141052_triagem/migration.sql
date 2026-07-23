-- CreateTable
CREATE TABLE "triagem.configs" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active_items" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triagem.configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triagem.monthly" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "download_date" TIMESTAMP(3),
    "settlement_date" TIMESTAMP(3),
    "billing_amount" TEXT,
    "triad_moviment" BOOLEAN NOT NULL DEFAULT false,
    "responsible_id" TEXT,
    "notes" TEXT,
    "justification" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triagem.monthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "triagem.configs_client_id_type_key" ON "triagem.configs"("client_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "triagem.monthly_client_id_competence_type_key" ON "triagem.monthly"("client_id", "competence", "type");

-- AddForeignKey
ALTER TABLE "triagem.configs" ADD CONSTRAINT "triagem.configs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem.monthly" ADD CONSTRAINT "triagem.monthly_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem.monthly" ADD CONSTRAINT "triagem.monthly_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
