-- CreateTable
CREATE TABLE "clients.historyPending" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "clients.historyPending_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clients.historyPending" ADD CONSTRAINT "clients.historyPending_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.historyPending" ADD CONSTRAINT "clients.historyPending_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
