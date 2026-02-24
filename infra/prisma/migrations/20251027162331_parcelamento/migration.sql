-- CreateTable
CREATE TABLE "parcelamento.installments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "is_automatic_debit" BOOLEAN NOT NULL,
    "consolidated_total_amount" DOUBLE PRECISION NOT NULL,
    "first_installment_amount" DOUBLE PRECISION NOT NULL,
    "current_month_installment_amount" DOUBLE PRECISION NOT NULL,
    "outstanding_balance" DOUBLE PRECISION NOT NULL,
    "paid_installments_count" INTEGER NOT NULL,
    "agreed_installments_count" INTEGER NOT NULL,
    "remaining_installments_count" INTEGER NOT NULL,
    "overdue_installments_count" INTEGER NOT NULL,
    "enrollment_date" TIMESTAMP(3),
    "document_url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "completion_date" TIMESTAMP(3),
    "down_payment_installments_count" INTEGER NOT NULL,

    CONSTRAINT "parcelamento.installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelamento.installmentsCompetencies" (
    "id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "how_many_paid" INTEGER NOT NULL,
    "how_many_overdue" INTEGER NOT NULL,
    "download" BOOLEAN NOT NULL,
    "download_notes" TEXT,
    "upload_file" BOOLEAN,
    "is_sent" BOOLEAN,
    "submission_type" TEXT,
    "notes" TEXT,
    "installment_amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "parcelamento.installmentsCompetencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcelamento.panorama" (
    "id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "cnd_municipal" BOOLEAN NOT NULL,
    "cnd_state" BOOLEAN NOT NULL,
    "cnd_federal" BOOLEAN NOT NULL,
    "cnd_fgts" BOOLEAN NOT NULL,
    "cnd_labor" BOOLEAN NOT NULL,
    "protests" BOOLEAN NOT NULL,
    "state_tax_situation" BOOLEAN NOT NULL,
    "federal_tax_situation" BOOLEAN NOT NULL,
    "responsavel_id" TEXT,

    CONSTRAINT "parcelamento.panorama_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "parcelamento.installments" ADD CONSTRAINT "parcelamento.installments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.installmentsCompetencies" ADD CONSTRAINT "parcelamento.installmentsCompetencies_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "parcelamento.installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.panorama" ADD CONSTRAINT "parcelamento.panorama_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcelamento.panorama" ADD CONSTRAINT "parcelamento.panorama_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
