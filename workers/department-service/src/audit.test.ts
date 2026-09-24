import { describe, expect, it, vi } from "vitest";

import { createDepartmentAudit } from "./audit.js";
import type { DepartmentWorkerEnv } from "./env.js";

function environment(fetch: typeof fetch): DepartmentWorkerEnv {
  return {
    JWT_SECRET: "secret",
    INTERNAL_SERVICE_TOKEN: "internal-token",
    AUDIT_SERVICE_TOKEN: "audit-token",
    AUDIT_SERVICE: { fetch },
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

describe("department audit binding", () => {
  it("posts entity changes through the binding without a configured URL", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 201 }));
    const audit = createDepartmentAudit(environment(fetch));

    await audit.createLog({
      userId: "user-1",
      organizationId: "org-1",
      action: "Cadastro",
      referring: "departments",
      referringId: "dep-1",
      changes: "{}",
    });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://audit-service/internal/audit/requests");
    expect(request.headers.get("x-internal-service-token")).toBe("audit-token");
    expect(await request.json()).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      referring: "departments",
      referringId: "dep-1",
    });
  });

  it("keeps entity writes best-effort when audit is unavailable", async () => {
    const audit = createDepartmentAudit(
      environment(vi.fn(async () => new Response(null, { status: 503 }))),
    );

    await expect(
      audit.createLog({
        userId: "user-1",
        action: "Cadastro",
        referring: "departments",
        referringId: "dep-1",
        changes: "{}",
      }),
    ).resolves.toBeUndefined();
  });
});
