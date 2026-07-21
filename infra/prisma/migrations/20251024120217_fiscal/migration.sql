-- CreateTable
CREATE TABLE "fiscal.ncm" (
    "id" TEXT NOT NULL,
    "tax_regime" TEXT NOT NULL,
    "ncm_code" TEXT NOT NULL,
    "federal_taxation_type" TEXT NOT NULL,
    "ncm_notes" TEXT,
    "cst_pis_outgoing" TEXT,
    "cst_cofins_outgoing" TEXT,
    "product_group" TEXT,
    "description" TEXT NOT NULL,
    "validity_start_date" TIMESTAMP(3) NOT NULL,
    "information_source" TEXT,
    "reference_legislation" TEXT,
    "validity_end_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal.ncm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal.icms" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "item_number" TEXT,
    "cest_code" TEXT,
    "description" TEXT NOT NULL,
    "interstate_agreement" TEXT,
    "applied_original_mva" TEXT,
    "adjusted_mva" TEXT,
    "original_mva" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal.icms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal.ipi" (
    "id" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "ex" TEXT,
    "description" TEXT,
    "aliquot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal.ipi_pkey" PRIMARY KEY ("id")
);
