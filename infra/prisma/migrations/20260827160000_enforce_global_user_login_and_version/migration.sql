-- Abort before changing the schema when the read-only global-login preflight would report collisions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY "login"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Global user-login migration blocked by duplicate logins. Resolve collisions and rerun the preflight.';
  END IF;
END
$$;

ALTER TABLE "users" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
