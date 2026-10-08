import { describe, expect, it, vi } from "vitest";
import { createUserWorkerDependencies } from "./index.js";

describe("user Worker entrypoint dependencies", () => {
  it("injects server-side Storage without exposing the service-role secret", () => {
    const secret = "supabase-service-role-secret";
    const dependencies = createUserWorkerDependencies({
      JWT_SECRET: "jwt-secret",
      INTERNAL_SERVICE_TOKEN: "internal-token",
      SUPABASE_URL: "https://supabase.example",
      SUPABASE_SERVICE_ROLE_KEY: secret,
      HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    });

    expect(dependencies.storage).toBeDefined();
    expect(JSON.stringify(dependencies)).not.toContain(secret);
  });

  it("connects mutation audit to the configured binding", async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://audit-service/internal/audit/requests");
      expect(request.headers.get("x-internal-service-token")).toBe("audit-token");
      const body = (await request.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        action: "CREATE",
        referring: "user",
        serviceSource: "user-service",
      });
      return new Response(null, { status: 201 });
    });
    const dependencies = createUserWorkerDependencies({
      JWT_SECRET: "jwt-secret",
      INTERNAL_SERVICE_TOKEN: "internal-token",
      AUDIT_SERVICE: { fetch },
      AUDIT_SERVICE_TOKEN: "audit-token",
      HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    });

    await dependencies.audit({
      actorUserId: "user-1",
      organizationId: "org-1",
      action: "CREATE",
      referring: "user",
      referringId: "user-2",
      changes: { status: "active" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes audit failures observable without breaking the legacy best-effort contract", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const params = {
      actorUserId: "user-1",
      organizationId: "org-1",
      action: "UPDATE",
      referring: "user",
      referringId: "user-2",
      changes: { status: "inactive" },
    };

    await createUserWorkerDependencies({
      JWT_SECRET: "jwt-secret",
      INTERNAL_SERVICE_TOKEN: "internal-token",
      AUDIT_SERVICE: undefined,
    }).audit(params);

    await createUserWorkerDependencies({
      JWT_SECRET: "jwt-secret",
      INTERNAL_SERVICE_TOKEN: "internal-token",
      AUDIT_SERVICE: { fetch: vi.fn() },
    }).audit(params);

    const fetch = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await createUserWorkerDependencies({
      JWT_SECRET: "jwt-secret",
      INTERNAL_SERVICE_TOKEN: "internal-token",
      AUDIT_SERVICE: { fetch },
      AUDIT_SERVICE_TOKEN: "audit-token",
    }).audit(params);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("AUDIT_SERVICE"));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("503"));
    warning.mockRestore();
  });

  it("binds Hyperdrive and never offers a DATABASE_URL fallback", async () => {
    const config = JSON.parse(
      (
        await (
          await import("node:fs/promises")
        ).readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")
      ).replace(/^\s*\/\/.*$/gm, ""),
    ) as { hyperdrive?: Array<{ binding: string; id: string }> };

    // O Worker recusa tráfego de banco sem este binding (app.ts:100), então a
    // ausência dele é 503 em produção, não degradação silenciosa.
    expect(config.hyperdrive?.map((entry) => entry.binding)).toContain("HYPERDRIVE");
    expect(config.hyperdrive?.[0]?.id).toMatch(/^[0-9a-f]{32}$/u);
    expect(JSON.stringify(config)).not.toMatch(/DATABASE_URL/iu);
  });
});
