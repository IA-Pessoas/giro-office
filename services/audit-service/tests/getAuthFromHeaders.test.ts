import {
  FORWARDED_AUTH_KIND_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_SUPPORT_MODE_HEADER,
  FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared/http";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { getAuthFromHeaders } from "../src/middlewares/getAuthFromHeaders.js";

function requestWithHeaders(headers: Record<string, string>): Request {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    get(name: string): string | undefined {
      return normalizedHeaders.get(name.toLowerCase());
    },
  } as Request;
}

describe("getAuthFromHeaders", () => {
  it("allows platform super admin without forwarded organization header", () => {
    const auth = getAuthFromHeaders(
      requestWithHeaders({
        [FORWARDED_AUTH_USER_ID_HEADER]: "platform-1",
        [FORWARDED_AUTH_KIND_HEADER]: "platform",
        [FORWARDED_AUTH_PLATFORM_ROLE_HEADER]: "super_admin",
        [FORWARDED_AUTH_SUPPORT_MODE_HEADER]: "true",
        [FORWARDED_AUTH_SUPPORT_SESSION_ID_HEADER]: "support-1",
        [FORWARDED_AUTH_SUPPORT_ORGANIZATION_ID_HEADER]: "org-1",
      }),
    );

    expect(auth).toEqual({
      userId: "platform-1",
      organizationId: undefined,
      permission: undefined,
      authKind: "platform",
      platformRole: "super_admin",
      supportMode: true,
      supportSessionId: "support-1",
      supportOrganizationId: "org-1",
    });
  });

  it("requires forwarded organization header for organization users", () => {
    let thrownError: unknown;

    try {
      getAuthFromHeaders(
        requestWithHeaders({
          [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
          [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
        }),
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({
      statusCode: 401,
    });
  });

  it("keeps organization id required and parsed for organization admin context", () => {
    const auth = getAuthFromHeaders(
      requestWithHeaders({
        [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "org-1",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
      }),
    );

    expect(auth).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      permission: 2,
      authKind: "organization",
    });
  });
});
