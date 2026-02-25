-- CreateTable
CREATE TABLE "permissions.specific" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_completion" INTEGER,

    CONSTRAINT "permissions.specific_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "permissions.specific" ADD CONSTRAINT "permissions.specific_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
