CREATE TABLE "contabil.noah_conversions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_name" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "result_sha256" TEXT NOT NULL,
    "csv" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "file_count" INTEGER NOT NULL,
    "rejections" JSONB NOT NULL,
    CONSTRAINT "contabil.noah_conversions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contabil.noah_conversions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "contabil.noah_conversions_organization_id_created_at_idx"
ON "contabil.noah_conversions" ("organization_id", "created_at");
