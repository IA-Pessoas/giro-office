-- One-time repair for the verified legacy Super Admin schema, not a new migration.
-- Keep 20260821200000_add_platform_auth_sessions/migration.sql unchanged.
-- See docs/migration/reconcile-platform-auth-sessions.md before running this file.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;

-- Serialize the schema check and ALTER, with a short wait instead of an indefinite lock.
LOCK TABLE public.platform_users IN ACCESS EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = to_regtype('public."PlatformRole"'))
      IS DISTINCT FROM ARRAY['super_admin']::text[] THEN
    RAISE EXCEPTION 'Incompatible legacy PlatformRole; stop and inspect the schema';
  END IF;

  IF to_regclass('public.platform_auth_sessions') IS NOT NULL THEN
    RAISE EXCEPTION 'Auth sessions already exist; verify the schema and migration history instead of reapplying';
  END IF;

  IF (SELECT relkind FROM pg_class WHERE oid = 'public.platform_users'::regclass) <> 'r' THEN
    RAISE EXCEPTION 'Incompatible legacy platform_users relation';
  END IF;

  -- Reject partial repairs, extra columns and incompatible definitions instead of hiding drift.
  IF EXISTS (
    WITH expected(name, type_name, not_null, default_expr) AS (
      VALUES
        ('id', 'text', true, NULL::text),
        ('name', 'text', true, NULL::text),
        ('email', 'text', true, NULL::text),
        ('password', 'text', true, NULL::text),
        ('platform_role', '"PlatformRole"', true, '''super_admin''::"PlatformRole"'),
        ('status', 'text', true, '''active''::text'),
        ('created_at', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
        ('updated_at', 'timestamp(3) without time zone', true, NULL::text)
    ), actual AS (
      SELECT a.attname::text AS name, format_type(a.atttypid, a.atttypmod) AS type_name,
        a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expr
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.platform_users'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    )
    SELECT 1 FROM expected e FULL JOIN actual a USING (name)
    WHERE e.name IS NULL OR a.name IS NULL
      OR (a.type_name, a.not_null, a.default_expr)
        IS DISTINCT FROM (e.type_name, e.not_null, e.default_expr)
  ) THEN
    RAISE EXCEPTION 'Incompatible legacy platform_users columns; stop and inspect the schema';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_index i ON i.indexrelid = c.conindid
    WHERE c.conrelid = 'public.platform_users'::regclass
      AND c.conname = 'platform_users_pkey' AND c.contype = 'p'
      AND NOT c.condeferrable AND c.convalidated AND i.indisvalid AND i.indisready
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.platform_users'::regclass
      AND i.indexrelid = to_regclass('public.platform_users_email_key')
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND pg_get_indexdef(i.indexrelid) =
        'CREATE UNIQUE INDEX platform_users_email_key ON public.platform_users USING btree (email)'
  ) THEN
    RAISE EXCEPTION 'Incompatible legacy platform_users primary key or email uniqueness';
  END IF;
END
$preflight$;

-- No replacement of the existing table, users, passwords or support-session foreign keys.
ALTER TABLE public.platform_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE public.platform_auth_sessions (
  id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_auth_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT platform_auth_sessions_platform_user_id_fkey
    FOREIGN KEY (platform_user_id) REFERENCES public.platform_users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_platform_auth_sessions_user_state
  ON public.platform_auth_sessions(platform_user_id, revoked_at, expires_at);
CREATE INDEX idx_platform_auth_sessions_expiry ON public.platform_auth_sessions(expires_at);

-- Auth session storage is backend-only, including when public has default Data API grants.
ALTER TABLE public.platform_auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_auth_sessions FROM PUBLIC;
DO $permissions$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.platform_auth_sessions FROM %I', api_role);
    END IF;
  END LOOP;
END
$permissions$;
COMMIT;
