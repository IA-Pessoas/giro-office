import { describe, expect, it, vi } from "vitest";
import { createMarketingWorkerAudit } from "./audit.js";

const entry = {
  organizationId: "a0000000-0000-4000-8000-000000000001",
  userId: "user-1",
  action: "Edição",
  referring: "marketing.events",
  referringId: "e0000000-0000-4000-8000-000000000001",
  changes: { name: { from: "Feira", to: "Feira anual" } },
};

function env(fetch: (request: Request) => Promise<Response>) {
  return {
    JWT_SECRET: "secret",
    INTERNAL_SERVICE_TOKEN: "internal",
    AUDIT_SERVICE: { fetch: vi.fn(fetch) },
    AUDIT_SERVICE_TOKEN: "audit-token",
  };
}

describe("auditoria do marketing Worker", () => {
  it("envia ator, organização, objeto, instante e mudança ao audit-service", async () => {
    const bindings = env(async () => new Response(null, { status: 201 }));
    await createMarketingWorkerAudit(bindings as never)(entry);

    const request = bindings.AUDIT_SERVICE.fetch.mock.calls[0][0];
    expect(request.headers.get("x-internal-service-token")).toBe("audit-token");
    expect(await request.json()).toMatchObject({
      organizationId: entry.organizationId,
      userId: "user-1",
      method: "ENTITY_CHANGE",
      path: "/marketing/events",
      serviceSource: "marketing-service",
      action: "Edição",
      referring: "marketing.events",
      referringId: entry.referringId,
      changes: entry.changes,
      createdAt: expect.any(String),
    });
  });

  it("lança 503 quando o audit-service recusa, para a transação desfazer a alteração", async () => {
    const bindings = env(async () => new Response(null, { status: 500 }));
    await expect(createMarketingWorkerAudit(bindings as never)(entry)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("lança 503 sem binding em vez de aceitar alteração sem trilha", async () => {
    await expect(
      createMarketingWorkerAudit({ JWT_SECRET: "s", INTERNAL_SERVICE_TOKEN: "i" } as never)(entry),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
