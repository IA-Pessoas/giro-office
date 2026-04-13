-- CreateTable
CREATE TABLE "mtk_passwords" (
    "id" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mtk_passwords_pkey" PRIMARY KEY ("id")
);
