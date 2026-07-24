-- AlterTable: add organization_id back (was removed by remove_org_id_from_user)
ALTER TABLE "users" ADD COLUMN "organization_id" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add type, first_owner_flag, permission_id to users
ALTER TABLE "users" ADD COLUMN "type" "enumType";
ALTER TABLE "users" ADD COLUMN "first_owner_flag" BOOLEAN DEFAULT false;
ALTER TABLE "users" ADD COLUMN "permission_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_permission_id_key" ON "users"("permission_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
