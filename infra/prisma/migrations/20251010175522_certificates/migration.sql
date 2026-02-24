-- CreateTable
CREATE TABLE "certificate.pj" (
    "id" TEXT NOT NULL,
    "client_castelo_status" BOOLEAN NOT NULL,
    "client_focus_status" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "legal_nature" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "was_paid" BOOLEAN NOT NULL,
    "payment_date" TIMESTAMP(3),
    "payment_amount" DOUBLE PRECISION,
    "contact_info" TEXT,
    "file_path" TEXT,
    "has_certificate" BOOLEAN NOT NULL,

    CONSTRAINT "certificate.pj_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate.pf" (
    "id" TEXT NOT NULL,
    "client_castelo_status" BOOLEAN NOT NULL,
    "client_focus_status" BOOLEAN NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "enterprise" TEXT,
    "cnpj" TEXT,
    "was_paid" BOOLEAN NOT NULL,
    "payment_date" TIMESTAMP(3),
    "payment_amount" DOUBLE PRECISION,
    "contact_info" TEXT,
    "file_path" TEXT,
    "has_certificate" BOOLEAN NOT NULL,

    CONSTRAINT "certificate.pf_pkey" PRIMARY KEY ("id")
);
