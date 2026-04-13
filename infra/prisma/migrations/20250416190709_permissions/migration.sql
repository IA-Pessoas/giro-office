-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "atendimento" INTEGER,
    "certificado" INTEGER,
    "comercial" INTEGER,
    "contabil" INTEGER,
    "financeiro" INTEGER,
    "fiscal" INTEGER,
    "integracao" INTEGER,
    "marketing" INTEGER,
    "parcelamento" INTEGER,
    "pec" INTEGER,
    "pessoal" INTEGER,
    "regularize" INTEGER,
    "rh" INTEGER,
    "triagem" INTEGER,
    "wiki" INTEGER,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
