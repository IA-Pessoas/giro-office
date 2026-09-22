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
  it("não chama loopback nem outro destino sem endpoint ou binding explícito", async () => {
    const fetchImpl = vi.fn();

    await createReportsAuditRecorder({ fetchImpl })(payload);

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
