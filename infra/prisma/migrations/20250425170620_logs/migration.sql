-- CreateTable
CREATE TABLE "historico_logs" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "referring" TEXT NOT NULL,
    "referring_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_logs_pkey" PRIMARY KEY ("id")
);
