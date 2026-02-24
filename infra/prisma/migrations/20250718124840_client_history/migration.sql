-- CreateTable
CREATE TABLE "clients.history" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "history" TEXT NOT NULL,
    "file" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "clients.history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clients.history" ADD CONSTRAINT "clients.history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.history" ADD CONSTRAINT "clients.history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
