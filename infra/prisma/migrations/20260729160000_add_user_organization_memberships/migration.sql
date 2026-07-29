CREATE TABLE "user_organizations" (
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "department_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("user_id", "organization_id")
);

INSERT INTO "user_organizations" ("user_id", "organization_id", "status", "department_id", "created_at", "updated_at")
SELECT
    u."id",
    COALESCE(u."organization_id", d."organization_id"),
    'active',
    CASE
        WHEN u."organization_id" IS NULL OR u."organization_id" = d."organization_id" THEN u."department_id"
        ELSE NULL
    END,
    COALESCE(u."joined_at", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "departments" d ON d."id" = u."department_id"
WHERE COALESCE(u."organization_id", d."organization_id") IS NOT NULL
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

CREATE INDEX "idx_user_organizations_user_status" ON "user_organizations"("user_id", "status");
CREATE INDEX "idx_user_organizations_org_status" ON "user_organizations"("organization_id", "status");

ALTER TABLE "user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organizations"
    ADD CONSTRAINT "user_organizations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organizations"
    ADD CONSTRAINT "user_organizations_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
