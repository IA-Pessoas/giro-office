import { describe, expect, it, vi } from "vitest";

import { buildAuditCapacityGuard } from "../middlewares/audit.js";

describe("buildAuditCapacityGuard", () => {
  it("fails closed before unsafe work when audit capacity is exhausted", () => {
    const reserve = vi.fn(() => false);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, { reserve }),
    });

    guard({ method: "POST", requestId: "request-1" } as never, {} as never, next);

    expect(reserve).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it("does not reserve capacity for an anonymous safe request", () => {
    const reserve = vi.fn(() => false);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, { reserve }),
    });

    guard({ method: "GET", requestId: "request-1" } as never, {} as never, next);

    expect(reserve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
