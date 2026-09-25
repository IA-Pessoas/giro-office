import { describe, expect, it, vi } from "vitest";

import { createUserAudit } from "./audit.js";
import type { UserWorkerEnv } from "./env.js";

const event = {
  organizationId: "org-1",
  action: "platform.impersonation.started",
  referring: "user",
  referringId: "user-1",
  changes: {},
};

describe("createUserAudit", () => {
  it("evento comum segue best-effort quando o serviço de auditoria falha", async () => {
    const audit = createUserAudit({
      AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 500 })) },
      AUDIT_SERVICE_TOKEN: "token",
    } as unknown as UserWorkerEnv);

    await expect(audit(event)).resolves.toBeUndefined();
  });

  it("evento obrigatório falha com 503 sem binding ou com resposta de erro", async () => {
    const missing = createUserAudit({} as UserWorkerEnv);
    const failing = createUserAudit({
      AUDIT_SERVICE: { fetch: vi.fn(async () => new Response(null, { status: 500 })) },
      AUDIT_SERVICE_TOKEN: "token",
    } as unknown as UserWorkerEnv);

    await expect(missing({ ...event, required: true })).rejects.toMatchObject({ statusCode: 503 });
    await expect(failing({ ...event, required: true })).rejects.toMatchObject({ statusCode: 503 });
  });
});
