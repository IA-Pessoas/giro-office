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
});
