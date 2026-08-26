import { describe, expect, it, vi } from "vitest";

import { buildAuditCapacityGuard } from "../middlewares/audit.js";

describe("buildAuditCapacityGuard", () => {
  it("fails closed before unsafe work when audit capacity is exhausted", () => {
    const reserve = vi.fn(() => undefined);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard(
      {
        method: "POST",
        originalUrl: "/platform/organizations",
        requestId: "request-1",
      } as never,
      {} as never,
      next,
    );

    expect(reserve).toHaveBeenCalledWith("protected");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it("does not reserve capacity for an anonymous safe request", () => {
    const reserve = vi.fn(() => undefined);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard({ method: "GET", requestId: "request-1" } as never, {} as never, next);

    expect(reserve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("uses the protected quota for authenticated reads", () => {
    const reserve = vi.fn(() => "protected" as const);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard(
      { method: "GET", requestId: "request-1", auth: { userId: "user-1" } } as never,
      {} as never,
      next,
    );

    expect(reserve).toHaveBeenCalledWith("protected");
    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ["POST", "/platform/organizations"],
    ["PATCH", "/platform/organizations/org-1/status"],
    ["PATCH", "/platform/organizations/org-1/subscription-plan"],
    ["PATCH", "/platform/organizations/org-1/logo-url"],
  ])("fails closed when audit is disabled for %s %s", (method, originalUrl) => {
    const reserve = vi.fn(() => "protected" as const);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: false,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard({ method, originalUrl, requestId: "request-1" } as never, {} as never, next);

    expect(reserve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it("fails closed when a required organization mutation has no request id", () => {
    const reserve = vi.fn(() => "protected" as const);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: true,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard({ method: "POST", originalUrl: "/platform/organizations" } as never, {} as never, next);

    expect(reserve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it("keeps disabled audit permissive outside exact organization mutations", () => {
    const reserve = vi.fn(() => undefined);
    const next = vi.fn();
    const guard = buildAuditCapacityGuard({
      enabled: false,
      recordAuditRequest: Object.assign(async () => {}, {
        reserve,
        recordRequired: async () => {},
      }),
    });

    guard(
      {
        method: "POST",
        originalUrl: "/platform/organizations/org-1/status/extra",
        requestId: "request-1",
      } as never,
      {} as never,
      next,
    );

    expect(reserve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
