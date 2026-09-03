DO $$
BEGIN
  IF to_regprocedure('extensions.crypt(text,text)') IS NULL THEN
    RAISE EXCEPTION 'The extensions.crypt(text,text) function is required before enabling user-service RLS.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enable user-service RLS while users.organization_id contains NULL values.';
  END IF;

  IF EXISTS (SELECT login FROM public.users GROUP BY login HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate users.login values prevent global login uniqueness.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giro_user_runtime') THEN
    CREATE ROLE giro_user_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE giro_user_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

ALTER TABLE public.users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.users ADD CONSTRAINT "users_login_key" UNIQUE (login);

REVOKE ALL ON TABLE public.users, public.departments, public.permissions,
  public."permissions.specific", public.organizations, public.logs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO giro_user_runtime;
GRANT SELECT ON TABLE public.departments, public.organizations TO giro_user_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.permissions, public."permissions.specific"
  TO giro_user_runtime;
GRANT INSERT ON TABLE public.logs TO giro_user_runtime;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public."permissions.specific" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."permissions.specific" FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public.users;
CREATE POLICY giro_user_runtime_tenant_isolation ON public.users
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public.departments;
CREATE POLICY giro_user_runtime_tenant_isolation ON public.departments
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public.permissions;
CREATE POLICY giro_user_runtime_tenant_isolation ON public.permissions
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public."permissions.specific";
CREATE POLICY giro_user_runtime_tenant_isolation ON public."permissions.specific"
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public.organizations;
CREATE POLICY giro_user_runtime_tenant_isolation ON public.organizations
  FOR ALL TO giro_user_runtime
  USING (id = current_setting('app.organization_id', true))
  WITH CHECK (id = current_setting('app.organization_id', true));

DROP POLICY IF EXISTS giro_user_runtime_tenant_isolation ON public.logs;
CREATE POLICY giro_user_runtime_tenant_isolation ON public.logs
  FOR ALL TO giro_user_runtime
  USING (organization_id = current_setting('app.organization_id', true))
  WITH CHECK (organization_id = current_setting('app.organization_id', true));

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO giro_user_runtime;

CREATE OR REPLACE FUNCTION app_private.login_session(p_login text, p_password text)
RETURNS TABLE (
  id text,
  name text,
  login text,
  permission integer,
  type text,
  session_version integer,
  department_id text,
  organization_id text,
  modules jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH candidate AS (
    SELECT
      u.id,
      u.name,
      u.login,
      u.password,
      u.permission,
      u.type,
      u.session_version,
      u.department_id,
      u.organization_id,
      u.status
    FROM public.users AS u
    WHERE u.login = p_login
  ),
  password_check AS (
    SELECT
      extensions.crypt(
        p_password,
        COALESCE(candidate.password, '$2b$08$C6UzMDM.H6dfI/f/IKcEe.7V0uJEv1cFYzn2rD6bFSbx2D9x8cT9G')
      ) = COALESCE(candidate.password, '$2b$08$C6UzMDM.H6dfI/f/IKcEe.7V0uJEv1cFYzn2rD6bFSbx2D9x8cT9G') AS valid
    FROM (VALUES (1)) AS request(value)
    LEFT JOIN candidate ON true
  )
  SELECT
    candidate.id,
    candidate.name,
    candidate.login,
    candidate.permission,
    candidate.type::text,
    candidate.session_version,
    candidate.department_id,
    candidate.organization_id,
    pg_catalog.jsonb_build_object(
      'certificado', COALESCE(p.certificado, 0),
      'comercial', COALESCE(p.comercial, 0),
      'contabil', COALESCE(p.contabil, 0),
      'financeiro', COALESCE(p.financeiro, 0),
      'fiscal', COALESCE(p.fiscal, 0),
      'integracao', COALESCE(p.integracao, 0),
      'marketing', COALESCE(p.marketing, 0),
      'parcelamento', COALESCE(p.parcelamento, 0),
      'pessoal', COALESCE(p.pessoal, 0),
      'regularize', COALESCE(p.regularize, 0),
      'rh', COALESCE(p.rh, 0),
      'ti', COALESCE(p.ti, 0),
      'triagem', COALESCE(p.triagem, 0)
    )
  FROM candidate
  JOIN public.departments AS d
    ON d.id = candidate.department_id AND d.organization_id = candidate.organization_id
  JOIN public.organizations AS o
    ON o.id = candidate.organization_id AND o.status = 'active'
  LEFT JOIN public.permissions AS p
    ON p.user_id = candidate.id AND p.organization_id = candidate.organization_id
  CROSS JOIN password_check
  WHERE candidate.status = 'active'
    AND password_check.valid;
$function$;

REVOKE ALL ON FUNCTION app_private.login_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.login_session(text, text) TO giro_user_runtime;
