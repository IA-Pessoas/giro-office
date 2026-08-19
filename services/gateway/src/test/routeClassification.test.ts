import { describe, expect, it } from "vitest";

import { getPublicRoute, isPublicRoute } from "../security/publicRoutes.js";
import {
  matchesGatewayRouteTemplate,
  normalizeGatewayPath,
} from "../security/routeClassification.js";

describe("route classification", () => {
  it("normalizes a trailing slash and removes the query string", () => {
    expect(normalizeGatewayPath("/user/me/?token=ignored")).toBe("/user/me");
  });

  it("rejects encoded separators instead of treating them as a path parameter", () => {
    expect(normalizeGatewayPath("/user%2fpermission/user-1")).toBeNull();
    expect(normalizeGatewayPath("/user%5Cpermission/user-1")).toBeNull();
  });

  it("rejects literal and encoded dot segments before URL normalization", () => {
    expect(normalizeGatewayPath("/user/../organizations")).toBeNull();
    expect(normalizeGatewayPath("/user/%2e%2e/organizations")).toBeNull();
    expect(normalizeGatewayPath("/user/%252e%252e/organizations")).toBeNull();
  });

  it("matches an OpenAPI template only when each parameter occupies one segment", () => {
    expect(matchesGatewayRouteTemplate("/client/{id}", "/client/client-1")).toBe(true);
    expect(matchesGatewayRouteTemplate("/client/{id}", "/client/client-1/finance")).toBe(false);
  });

  it("matches static segments with Express's default case-insensitive routing", () => {
    expect(
      matchesGatewayRouteTemplate("/ti/passwords/{id}/deactivate", "/TI/PASSWORDS/1/DEACTIVATE"),
    ).toBe(true);
  });

  it("registers the session endpoint as public only for its declared method", () => {
    expect(getPublicRoute("POST", "/user/session")).toEqual({
      reason: "Cria uma sessão sem contexto autenticado.",
    });
    expect(getPublicRoute("GET", "/user/session")).toBeNull();
  });

  it("does not register the removed bootstrap endpoint as public", () => {
    expect(getPublicRoute("POST", "/user/start-config")).toBeNull();
  });

  it("keeps Socket.IO transport public because the upstream validates its auth handshake", () => {
    expect(isPublicRoute("GET", "/socket.io/?EIO=4&transport=polling")).toBe(true);
    expect(isPublicRoute("POST", "/socket.io/")).toBe(true);
    expect(isPublicRoute("GET", "/socket.io-not-a-transport")).toBe(false);
  });
});
