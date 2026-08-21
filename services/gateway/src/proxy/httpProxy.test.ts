import {
  FORWARDED_AUTH_CSRF_HASH_HEADER,
  FORWARDED_AUTH_SESSION_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { buildForwardHeaders } from "./httpProxy.js";

const authenticatedRequest = {
  headers: {},
  protocol: "https",
  ip: "127.0.0.1",
  auth: {
    userId: "user-1",
    organizationId: "org-1",
    claims: {
      session_id: "session-1",
      csrf_hash: "a".repeat(64),
      session_version: 1,
    },
  },
} as unknown as Request;

describe("buildForwardHeaders", () => {
  it("mantém o vínculo secreto da sessão fora de upstreams comuns", () => {
    const headers = buildForwardHeaders(authenticatedRequest, {
      internalServiceToken: "shared-token",
    });

    expect(headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe("shared-token");
    expect(headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBeNull();
    expect(headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBeNull();
  });

  it("encaminha o vínculo somente quando o user-service solicita explicitamente", () => {
    const headers = buildForwardHeaders(authenticatedRequest, {
      forwardSessionBinding: true,
    });

    expect(headers.get(FORWARDED_AUTH_SESSION_ID_HEADER)).toBe("session-1");
    expect(headers.get(FORWARDED_AUTH_CSRF_HASH_HEADER)).toBe("a".repeat(64));
  });
});
