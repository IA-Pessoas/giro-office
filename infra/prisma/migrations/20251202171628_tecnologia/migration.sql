-- CreateTable
CREATE TABLE "tecnologia.passwords_users" (
    "id" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnologia.passwords_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.extensions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnologia.extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.inventoryCategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tecnologia.inventoryCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.inventoryLocations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tecnologia.inventoryLocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.inventory" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "location_id" TEXT,
    "category_id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "notes" TEXT,
    "delivery_date" TIMESTAMP(3),
    "return_date" TIMESTAMP(3),
    "responsible_it_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnologia.inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.terms" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_cpf" TEXT NOT NULL,
    "department_id" TEXT,
    "address" TEXT,
    "reason" TEXT,
    "equipament_list" TEXT,
    "brand" TEXT,
    "asset_code" TEXT,
    "imei" TEXT,

    CONSTRAINT "tecnologia.terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "assigned_to_id" TEXT,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tecnologia.requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.request_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tecnologia.request_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.request_messages" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachment" TEXT,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tecnologia.request_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tecnologia.passwords_users" ADD CONSTRAINT "tecnologia.passwords_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.extensions" ADD CONSTRAINT "tecnologia.extensions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventory" ADD CONSTRAINT "tecnologia.inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventory" ADD CONSTRAINT "tecnologia.inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tecnologia.inventoryLocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventory" ADD CONSTRAINT "tecnologia.inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tecnologia.inventoryCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.inventory" ADD CONSTRAINT "tecnologia.inventory_responsible_it_staff_id_fkey" FOREIGN KEY ("responsible_it_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.terms" ADD CONSTRAINT "tecnologia.terms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.requests" ADD CONSTRAINT "tecnologia.requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.requests" ADD CONSTRAINT "tecnologia.requests_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.requests" ADD CONSTRAINT "tecnologia.requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tecnologia.request_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.request_messages" ADD CONSTRAINT "tecnologia.request_messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "tecnologia.requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.request_messages" ADD CONSTRAINT "tecnologia.request_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
