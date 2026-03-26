-- CreateTable
CREATE TABLE "regularize.passowordsSites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sphere" TEXT NOT NULL,
    "link" TEXT,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regularize.passowordsSites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularize.passwordsRegularize" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "regularize.passwordsRegularize_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "regularize.passwordsRegularize" ADD CONSTRAINT "regularize.passwordsRegularize_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularize.passwordsRegularize" ADD CONSTRAINT "regularize.passwordsRegularize_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "regularize.passowordsSites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
