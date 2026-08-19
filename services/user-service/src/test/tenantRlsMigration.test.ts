import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../../infra/prisma/migrations/20260819150000_user_service_tenant_rls/migration.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

describe("migration de RLS do user-service", () => {
  it("protege as seis tabelas do domínio, a role runtime e o login privado", () => {
    expect(migration).toContain("CREATE ROLE giro_user_runtime NOLOGIN NOBYPASSRLS");
    expect(migration).toContain("to_regprocedure('extensions.crypt(text,text)')");
    expect(migration).toContain(
      'public."permissions.specific", public.organizations, public.logs FROM PUBLIC',
    );
    for (const table of [
      "users",
      "departments",
      "permissions",
      '"permissions.specific"',
      "organizations",
      "logs",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ON public.${table}\n  FOR ALL TO giro_user_runtime`);
    }
    expect(migration).toContain("current_setting('app.organization_id', true)");
    expect(migration).toContain("WITH CHECK");
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS app_private");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("extensions.crypt");
    expect(migration).toContain("WITH candidate AS");
    expect(migration).toContain(
      "COALESCE(candidate.password, '$2b$08$C6UzMDM.H6dfI/f/IKcEe.7V0uJEv1cFYzn2rD6bFSbx2D9x8cT9G')",
    );
    expect(migration).toContain("FROM (VALUES (1)) AS request(value)");
    expect(migration).toContain("AND password_check.valid");
    expect(migration).toContain("Duplicate users.login values");
    expect(migration).toContain('ADD CONSTRAINT "users_login_key" UNIQUE (login)');
    expect(migration).toContain("GRANT INSERT ON TABLE public.logs TO giro_user_runtime");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION app_private.login_session(text, text) FROM PUBLIC",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION app_private.login_session(text, text) TO giro_user_runtime",
    );
  });
});
