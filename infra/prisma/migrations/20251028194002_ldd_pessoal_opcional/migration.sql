-- AlterTable
ALTER TABLE "pessoal.ldd" ALTER COLUMN "period" DROP NOT NULL,
ALTER COLUMN "balance_amount" DROP NOT NULL,
ALTER COLUMN "registration_status" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;
