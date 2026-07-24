-- CreateTable
CREATE TABLE "notification.regularize" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "regarding" TEXT NOT NULL,
    "regarding_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification.regularize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients.pf" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "father" TEXT NOT NULL,
    "mother" TEXT NOT NULL,
    "marital_status" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "cpf" TEXT NOT NULL,
    "rg" TEXT NOT NULL,
    "rg_expedition" TIMESTAMP(3),
    "rg_validity" TIMESTAMP(3),
    "military_certificate" TEXT NOT NULL,
    "ctps" TEXT NOT NULL,
    "cnh" TEXT NOT NULL,
    "cnh_expedition" TIMESTAMP(3),
    "cnh_validity" TIMESTAMP(3),
    "spouse" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "clients.pf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.license" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "has" BOOLEAN NOT NULL,
    "type_license" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "protocol" TEXT NOT NULL,
    "responsible_id" TEXT,
    "status" TEXT NOT NULL,
    "date_last_consultation" TIMESTAMP(3),
    "current_situation" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "observation" TEXT,
    "urgency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "task_id" TEXT,

    CONSTRAINT "regularize.license_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.process" (
    "id" TEXT NOT NULL,
    "client_pj_id" TEXT,
    "client_pf_id" TEXT,
    "cpf_cnpj" TEXT NOT NULL,
    "process_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "expected_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "observation" TEXT,
    "responsible1_id" TEXT,
    "responsible2_id" TEXT,
    "responsible3_id" TEXT,
    "locking_type" TEXT,
    "urgency" TEXT,
    "task_id" TEXT,

    CONSTRAINT "regularize.process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.proceduralGuidances" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "type" TEXT,
    "request" TEXT,
    "framework_obs" TEXT,
    "legal_nature" TEXT,
    "company_name" TEXT,
    "trade_name" TEXT,
    "cpf_cnpj" TEXT,
    "share_capital" DOUBLE PRECISION,
    "iptu" TEXT,
    "address" TEXT,
    "comporate_purpose" TEXT,
    "carryng" TEXT,
    "regime" TEXT,
    "legal_representative" TEXT,
    "status" TEXT NOT NULL,
    "economic_activities" JSONB,
    "partners" JSONB,

    CONSTRAINT "regularize.proceduralGuidances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.partners" (
    "id" TEXT NOT NULL,
    "pj_id" TEXT NOT NULL,
    "pf_id" TEXT NOT NULL,
    "part" DOUBLE PRECISION NOT NULL,
    "entry" TIMESTAMP(3) NOT NULL,
    "exit" TIMESTAMP(3),

    CONSTRAINT "regularize.partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.municipalTaxes" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "tff_is_applicable" BOOLEAN NOT NULL,
    "tff_amount" DOUBLE PRECISION NOT NULL,
    "tff_notes" TEXT,
    "tff_analysis_is_done" BOOLEAN NOT NULL,
    "tff_analysis_notes" TEXT,
    "tff_sent_date" TIMESTAMP(3),
    "tff_due_date" TIMESTAMP(3),
    "tlp_is_applicable" BOOLEAN NOT NULL,
    "tlp_amount" DOUBLE PRECISION NOT NULL,
    "tlp_notes" TEXT,
    "tlp_is_sent" TEXT NOT NULL,
    "tlp_sent_date" TIMESTAMP(3),
    "tlp_due_date" TIMESTAMP(3),
    "tlp_not_email" BOOLEAN NOT NULL,
    "tll_is_applicable" BOOLEAN NOT NULL,
    "tll_amount" DOUBLE PRECISION NOT NULL,
    "tll_notes" TEXT,
    "tll_is_sent" TEXT NOT NULL,
    "tll_sent_date" TIMESTAMP(3),
    "tll_due_date" TIMESTAMP(3),
    "tll_analysis_is_done" BOOLEAN NOT NULL,
    "tll_analysis_notes" TEXT,

    CONSTRAINT "regularize.municipalTaxes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "regularize.license" ADD CONSTRAINT "regularize.license_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.license" ADD CONSTRAINT "regularize.license_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.license" ADD CONSTRAINT "regularize.license_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_client_pj_id_fkey" FOREIGN KEY ("client_pj_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_client_pf_id_fkey" FOREIGN KEY ("client_pf_id") REFERENCES "clients.pf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_responsible1_id_fkey" FOREIGN KEY ("responsible1_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_responsible2_id_fkey" FOREIGN KEY ("responsible2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_responsible3_id_fkey" FOREIGN KEY ("responsible3_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.process" ADD CONSTRAINT "regularize.process_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "integracao.tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.proceduralGuidances" ADD CONSTRAINT "regularize.proceduralGuidances_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "regularize.process"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.partners" ADD CONSTRAINT "regularize.partners_pj_id_fkey" FOREIGN KEY ("pj_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.partners" ADD CONSTRAINT "regularize.partners_pf_id_fkey" FOREIGN KEY ("pf_id") REFERENCES "clients.pf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.municipalTaxes" ADD CONSTRAINT "regularize.municipalTaxes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
