/*
  Warnings:

  - You are about to drop the column `cliente_id` on the `parcelamento.panorama` table. All the data in the column will be lost.
  - Added the required column `client_id` to the `parcelamento.panorama` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "parcelamento.panorama" DROP CONSTRAINT "parcelamento.panorama_cliente_id_fkey";

-- AlterTable
ALTER TABLE "parcelamento.panorama" DROP COLUMN "cliente_id",
ADD COLUMN     "client_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "parcelamento.panorama" ADD CONSTRAINT "parcelamento.panorama_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
