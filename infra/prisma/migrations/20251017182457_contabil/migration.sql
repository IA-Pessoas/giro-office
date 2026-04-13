-- CreateTable
CREATE TABLE "contabil.control" (
    "id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "regenerate_accounting_entries" BOOLEAN NOT NULL,
    "check_summary_by_accumulator" BOOLEAN NOT NULL,
    "post_accounting_transaction" BOOLEAN NOT NULL,
    "import_bank_statements" BOOLEAN NOT NULL,
    "reconcile_bank_statements" BOOLEAN NOT NULL,
    "reconcile_vendors" BOOLEAN NOT NULL,
    "integrate_taxes" BOOLEAN NOT NULL,
    "settle_federal_taxes_via_ecac" BOOLEAN NOT NULL,
    "settle_state_taxes_via_sefaz_ba" BOOLEAN NOT NULL,
    "integrate_payroll" BOOLEAN NOT NULL,
    "suspense_accounts" BOOLEAN NOT NULL,
    "check_overdrawn_accounts" BOOLEAN NOT NULL,
    "general_account_reconciliation" BOOLEAN NOT NULL,
    "check_loan_and_interest_accounts" BOOLEAN NOT NULL,
    "monthly_closing" BOOLEAN NOT NULL,
    "reconcile_icms_pis_cofins" BOOLEAN NOT NULL,
    "depreciation" BOOLEAN NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "contabil.control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contabil.responsibles" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "person_responsible_id" TEXT DEFAULT '',
    "posted_by_id" TEXT DEFAULT '',
    "customer_with_movement" BOOLEAN DEFAULT false,

    CONSTRAINT "contabil.responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contabil.relationship" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "bidding" BOOLEAN NOT NULL,
    "chart_accounts" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "contabil.relationship_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "contabil.control" ADD CONSTRAINT "contabil.control_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.responsibles" ADD CONSTRAINT "contabil.responsibles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.responsibles" ADD CONSTRAINT "contabil.responsibles_person_responsible_id_fkey" FOREIGN KEY ("person_responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.responsibles" ADD CONSTRAINT "contabil.responsibles_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contabil.relationship" ADD CONSTRAINT "contabil.relationship_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
