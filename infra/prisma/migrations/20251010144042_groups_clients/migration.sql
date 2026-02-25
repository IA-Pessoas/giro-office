-- CreateTable
CREATE TABLE "clients.group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clients.group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients.clientsGroup" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,

    CONSTRAINT "clients.clientsGroup_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clients.clientsGroup" ADD CONSTRAINT "clients.clientsGroup_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "clients.group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients.clientsGroup" ADD CONSTRAINT "clients.clientsGroup_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
