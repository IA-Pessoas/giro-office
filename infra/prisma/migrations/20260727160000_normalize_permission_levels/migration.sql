-- The marker makes the data transformation safe if an operator re-runs this SQL manually.
CREATE TABLE IF NOT EXISTS "_giro_permission_migrations" (
    "name" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "_giro_permission_migrations_pkey" PRIMARY KEY ("name")
);

DO $$
DECLARE
    migration_applied BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM "_giro_permission_migrations"
        WHERE "name" = '20260727160000_normalize_permission_levels'
    ) INTO migration_applied;

    IF NOT migration_applied THEN
        UPDATE "permissions"
        SET
            "certificado" = CASE WHEN "certificado" IS NULL THEN 0 ELSE "certificado" + 1 END,
            "comercial" = CASE WHEN "comercial" IS NULL THEN 0 ELSE "comercial" + 1 END,
            "contabil" = CASE WHEN "contabil" IS NULL THEN 0 ELSE "contabil" + 1 END,
            "financeiro" = CASE WHEN "financeiro" IS NULL THEN 0 ELSE "financeiro" + 1 END,
            "fiscal" = CASE WHEN "fiscal" IS NULL THEN 0 ELSE "fiscal" + 1 END,
            "integracao" = CASE WHEN "integracao" IS NULL THEN 0 ELSE "integracao" + 1 END,
            "marketing" = CASE WHEN "marketing" IS NULL THEN 0 ELSE "marketing" + 1 END,
            "parcelamento" = CASE WHEN "parcelamento" IS NULL THEN 0 ELSE "parcelamento" + 1 END,
            "pessoal" = CASE WHEN "pessoal" IS NULL THEN 0 ELSE "pessoal" + 1 END,
            "regularize" = CASE WHEN "regularize" IS NULL THEN 0 ELSE "regularize" + 1 END,
            "rh" = CASE WHEN "rh" IS NULL THEN 0 ELSE "rh" + 1 END,
            "ti" = CASE WHEN "ti" IS NULL THEN 0 ELSE "ti" + 1 END,
            "triagem" = CASE WHEN "triagem" IS NULL THEN 0 ELSE "triagem" + 1 END;

        INSERT INTO "_giro_permission_migrations" ("name")
        VALUES ('20260727160000_normalize_permission_levels')
        ON CONFLICT ("name") DO NOTHING;
    END IF;
END $$;

ALTER TABLE "permissions"
    DROP COLUMN IF EXISTS "atendimento",
    DROP COLUMN IF EXISTS "pec",
    DROP COLUMN IF EXISTS "wiki";

DO $$
DECLARE
    module_name TEXT;
BEGIN
    FOREACH module_name IN ARRAY ARRAY[
        'certificado', 'comercial', 'contabil', 'financeiro', 'fiscal', 'integracao',
        'marketing', 'parcelamento', 'pessoal', 'regularize', 'rh', 'ti', 'triagem'
    ] LOOP
        EXECUTE format('UPDATE "permissions" SET %I = 0 WHERE %I IS NULL', module_name, module_name);
        EXECUTE format('ALTER TABLE "permissions" ALTER COLUMN %I SET DEFAULT 0', module_name);
        EXECUTE format('ALTER TABLE "permissions" ALTER COLUMN %I SET NOT NULL', module_name);
        EXECUTE format('ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS %I',
            'permissions_' || module_name || '_range');
        EXECUTE format(
            'ALTER TABLE "permissions" ADD CONSTRAINT %I CHECK (%I BETWEEN 0 AND 3)',
            'permissions_' || module_name || '_range', module_name
        );
    END LOOP;
END $$;

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_session_version_nonnegative";

ALTER TABLE "users"
    ADD CONSTRAINT "users_session_version_nonnegative" CHECK ("session_version" >= 0);
