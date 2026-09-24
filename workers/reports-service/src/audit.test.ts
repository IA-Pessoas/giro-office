import { describe, expect, it, vi } from "vitest";

import { createReportsAuditRecorder } from "./audit.js";

const payload = {
  requestId: "request-1",
  method: "REPORT_LIFECYCLE",
  outcome: "success" as const,
  serviceSource: "reports-service",
  createdAt: "2026-09-22T00:00:00.000Z",
};

describe("reports worker audit", () => {
  it("falha explicitamente sem endpoint ou binding configurado", () => {
    const fetchImpl = vi.fn();

    expect(() => createReportsAuditRecorder({ fetchImpl })).toThrow(
      "Auditoria externa não configurada.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("expõe erro HTTP do endpoint configurado", async () => {
    const recorder = createReportsAuditRecorder({
      serviceUrl: "https://audit.test",
      serviceToken: "audit-token",
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    });

    await expect(recorder(payload)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("usa o binding interno e envia o token do contrato", async () => {
    const service = {
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
    };
    const recorder = createReportsAuditRecorder({
      service,
      serviceToken: "audit-token",
    });

    await expect(recorder(payload)).resolves.toBeUndefined();

    const [input, init] = service.fetch.mock.calls[0] as [string, RequestInit];
    expect(new URL(input).pathname).toBe("/internal/audit/requests");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-internal-service-token")).toBe("audit-token");
  });

  it("falha explicitamente com endpoint inválido", () => {
    expect(() =>
      createReportsAuditRecorder({
        serviceUrl: "not-a-url",
        serviceToken: "audit-token",
      }),
    ).toThrow("Endpoint da auditoria externa inválido.");
  });

  it("expõe falha de transporte e timeout sem retry silencioso", async () => {
    const transport = createReportsAuditRecorder({
      serviceUrl: "https://audit.test",
      serviceToken: "audit-token",
      fetchImpl: vi.fn().mockRejectedValue(new Error("network")),
    });
    const timeout = createReportsAuditRecorder({
      serviceUrl: "https://audit.test",
      serviceToken: "audit-token",
      fetchImpl: vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    });

    await expect(transport(payload)).rejects.toMatchObject({ statusCode: 503 });
    await expect(timeout(payload)).rejects.toMatchObject({ statusCode: 504 });
  });
});
