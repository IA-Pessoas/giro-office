-- CreateTable
CREATE TABLE "logs.pessoal" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "referring" TEXT NOT NULL,
    "referring_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs.pessoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoal.union" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "base_date" TIMESTAMP(3),

    CONSTRAINT "pessoal.union_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoal.payroll" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "responsible_id" TEXT NOT NULL,
    "advance" BOOLEAN NOT NULL,
    "advance_type" TEXT,
    "advance_amount" DOUBLE PRECISION,
    "info" TEXT NOT NULL,
    "previous" BOOLEAN NOT NULL,
    "onvio" BOOLEAN NOT NULL,
    "group" TEXT NOT NULL,
    "vt" BOOLEAN NOT NULL,
    "vt_value" DOUBLE PRECISION,
    "vt_type" TEXT,
    "va" BOOLEAN NOT NULL,
    "assistance_fee" BOOLEAN NOT NULL,
    "union_id" TEXT,
    "bem_mais" BOOLEAN NOT NULL,
    "bsf" BOOLEAN NOT NULL,
    "reinf" BOOLEAN NOT NULL,
    "employees" INTEGER NOT NULL,
    "contact" TEXT,

    CONSTRAINT "pessoal.payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoal.obrigations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "advance" TEXT NOT NULL,
    "payroll" TEXT NOT NULL,
    "charges" TEXT NOT NULL,
    "assistance_fee" TEXT NOT NULL,
    "responsavel_id" TEXT,
    "bem_mais" TEXT,
    "bsf" TEXT,
    "va" TEXT,
    "vt" TEXT,

    CONSTRAINT "pessoal.obrigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoal.situations" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "registration_date" TIMESTAMP(3) NOT NULL,
    "completion_date" TIMESTAMP(3),
    "registered_by_id" TEXT NOT NULL,
    "completed_by_id" TEXT,

    CONSTRAINT "pessoal.situations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "logs.pessoal" ADD CONSTRAINT "logs.pessoal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.payroll" ADD CONSTRAINT "pessoal.payroll_union_id_fkey" FOREIGN KEY ("union_id") REFERENCES "pessoal.union"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.payroll" ADD CONSTRAINT "pessoal.payroll_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.obrigations" ADD CONSTRAINT "pessoal.obrigations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.obrigations" ADD CONSTRAINT "pessoal.obrigations_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.situations" ADD CONSTRAINT "pessoal.situations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.situations" ADD CONSTRAINT "pessoal.situations_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoal.situations" ADD CONSTRAINT "pessoal.situations_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
