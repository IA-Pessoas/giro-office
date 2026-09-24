import { afterEach, describe, expect, it, vi } from "vitest";
import { createContabilAudit } from "./audit.js";
import type { ContabilWorkerEnv } from "./env.js";

const baseParams = {
  userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  permission: 2,
  action: "CREATE",
  referring: "triage.monthly",
  referringId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  changes: { status: "PENDING" },
};

function env(fetch: (request: Request) => Promise<Response>): ContabilWorkerEnv {
  return {
    JWT_SECRET: "test-jwt-secret",
    INTERNAL_SERVICE_TOKEN: "test-internal-token",
    AUDIT_SERVICE_TOKEN: "test-audit-token",
    AUDIT_SERVICE: { fetch },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contabil audit recorder", () => {
  it("retries HTTP failures and exposes the retry event", async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const audit = createContabilAudit(env(fetch), {
      retryMaxAttempts: 2,
      retryBaseDelayMs: 0,
      sleep: vi.fn(async () => {}),
    });

    await audit.createLog(baseParams);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith(
      expect.objectContaining({ event: "contabil.audit.retry", attempt: 1, status: 503 }),
    );
  });

  it("returns an observable 503 after bounded retry exhaustion", async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response("down", { status: 503 }));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const audit = createContabilAudit(env(fetch), {
      retryMaxAttempts: 2,
      retryBaseDelayMs: 0,
      sleep: vi.fn(async () => {}),
    });

    await expect(audit.createLog(baseParams)).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "contabil.audit.failed", status: 503 }),
    );
  });

  it("converte timeout do recorder em erro 504 observável", async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const audit = createContabilAudit(env(fetch), {
      retryMaxAttempts: 1,
      timeoutMs: 1,
      sleep: vi.fn(async () => {}),
    });

    await expect(audit.createLog(baseParams)).rejects.toMatchObject({ statusCode: 504 });
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "contabil.audit.failed", status: 504 }),
    );
  });

  it("não descarta silenciosamente auditoria sem binding ou token", async () => {
    const withoutBinding = createContabilAudit({
      JWT_SECRET: "test-jwt-secret",
      INTERNAL_SERVICE_TOKEN: "test-internal-token",
    });
    const withoutToken = createContabilAudit({
      JWT_SECRET: "test-jwt-secret",
      INTERNAL_SERVICE_TOKEN: "test-internal-token",
      AUDIT_SERVICE: { fetch: vi.fn() },
    });

    await expect(withoutBinding.createLog(baseParams)).rejects.toMatchObject({ statusCode: 503 });
    await expect(withoutToken.createLog(baseParams)).rejects.toMatchObject({ statusCode: 503 });
  });
});
