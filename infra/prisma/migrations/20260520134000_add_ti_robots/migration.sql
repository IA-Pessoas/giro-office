-- CreateTable
CREATE TABLE "tecnologia.robots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "schedule" TEXT,
    "status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "tecnologia.robots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnologia.robot_runs" (
    "id" TEXT NOT NULL,
    "robot_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "message" TEXT,
    "metadata_json" JSONB,
    "organization_id" TEXT NOT NULL,

    CONSTRAINT "tecnologia.robot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tecnologia.robot_runs_robot_id_started_at_idx" ON "tecnologia.robot_runs"("robot_id", "started_at");

-- AddForeignKey
ALTER TABLE "tecnologia.robots" ADD CONSTRAINT "tecnologia.robots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.robot_runs" ADD CONSTRAINT "tecnologia.robot_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tecnologia.robot_runs" ADD CONSTRAINT "tecnologia.robot_runs_robot_id_fkey" FOREIGN KEY ("robot_id") REFERENCES "tecnologia.robots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
