import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { authorizeRequest, buildAuthorizeMiddleware } from "../middlewares/authorize.js";

describe("authorizeRequest", () => {
  it("denies an authenticated route without an explicit policy", () => {
    const next = vi.fn();
    const request = {
      method: "GET",
      path: "/new-unclassified-operation",
      originalUrl: "/new-unclassified-operation",
      auth: {
        token: "test-token",
        userId: "user-1",
        organizationId: "org-1",
        claims: {
          user_id: "user-1",
          organization_id: "org-1",
          permission: 2,
          type: "owner",
        },
      },
    } as Request;

    authorizeRequest(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: "FORBIDDEN",
      }),
    );
  });
});

it("allows an unclassified route only in observation mode and emits bounded telemetry", () => {
  const next = vi.fn();
  const warn = vi.fn();
  const request = {
    method: "GET",
    path: "/new-unclassified-operation",
    originalUrl: "/new-unclassified-operation",
    auth: {
      token: "test-token",
      userId: "user-1",
      organizationId: "org-1",
      claims: { user_id: "user-1", organization_id: "org-1", permission: 2, type: "owner" },
    },
  } as Request;

  buildAuthorizeMiddleware("observe", { warn })(request, {} as Response, next);

  expect(next).toHaveBeenCalledWith();
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "authorization.unclassified_route",
      authorization: { method: "GET", routeNamespace: "unknown" },
    }),
  );
});
