-- CreateTable
CREATE TABLE "stock.locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" INTEGER,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "stock.locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock.categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,

    CONSTRAINT "stock.categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "description" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock.entries" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "entry_by_user_id" TEXT NOT NULL,

    CONSTRAINT "stock.entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock.exits" (
    "id" TEXT NOT NULL,
    "stock_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "destination" TEXT,
    "exit_date" TIMESTAMP(3) NOT NULL,
    "requester_id" TEXT NOT NULL,
    "approver_id" TEXT,
    "operator_id" TEXT,
    "location_destination_id" TEXT,

    CONSTRAINT "stock.exits_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stock.locations" ADD CONSTRAINT "stock.locations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.categories" ADD CONSTRAINT "stock.categories_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "stock.categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock.locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.entries" ADD CONSTRAINT "stock.entries_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.entries" ADD CONSTRAINT "stock.entries_entry_by_user_id_fkey" FOREIGN KEY ("entry_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock.exits" ADD CONSTRAINT "stock.exits_location_destination_id_fkey" FOREIGN KEY ("location_destination_id") REFERENCES "stock.locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
