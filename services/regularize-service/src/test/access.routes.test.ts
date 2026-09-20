import "./envBootstrap.js";

import { createHmac } from "node:crypto";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestApp } from "./regularizeTestUtils.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createToken(claims: Record<string, unknown>): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode(claims);
  const signature = createHmac("sha256", "secret")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function authToken(permission: number, modules?: Record<string, number>): string {
  return createToken({
    user_id: "user-1",
    organization_id: "org-1",
    permission,
    type: "user",
    ...(modules ? { modules } : {}),
  });
}

describe("regularize access boundary", () => {
  it("returns 401 without authentication", async () => {
    const response = await request(createTestApp()).get("/regularize/dashboard");

    expect(response.status).toBe(401);
  });

  it("returns 403 when the authenticated user has Regularize permission 0", async () => {
    const response = await request(createTestApp())
      .get("/regularize/dashboard")
      .set("Authorization", `Bearer ${authToken(0, { regularize: 0 })}`);

    expect(response.status).toBe(403);
  });

  it("enforces the scoped permission on trusted gateway context", async () => {
    const app = createTestApp();
    const denied = await request(app)
      .get("/regularize/dashboard")
      .set({
        [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "org-1",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "0",
        [INTERNAL_SERVICE_TOKEN_HEADER]: "regularize-service-internal-token",
      });

    expect(denied.status).toBe(403);
  });

  it("does not trust forwarded identity headers without the internal token", async () => {
    const response = await request(createTestApp())
      .get("/regularize/dashboard")
      .set({
        [FORWARDED_AUTH_USER_ID_HEADER]: "user-1",
        [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: "org-1",
        [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
      });

    expect(response.status).toBe(401);
  });

  it("rejects a direct token without an organization context", async () => {
    const token = createToken({
      user_id: "user-1",
      permission: 1,
      type: "user",
      modules: { regularize: 1 },
    });

    const response = await request(createTestApp())
      .get("/regularize/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("allows a viewer to reach reads but not mutations", async () => {
    const app = createTestApp();
    const token = authToken(1, { regularize: 1 });

    const read = await request(app)
      .get("/regularize/dashboard")
      .set("Authorization", `Bearer ${token}`);
    const mutation = await request(app)
      .post("/regularize/process")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(read.status).toBe(400);
    expect(mutation.status).toBe(403);
  });

  it("allows an editor to reach mutations and rejects legacy global-only claims", async () => {
    const app = createTestApp();
    const moduleToken = authToken(2, { regularize: 2 });
    const legacyToken = authToken(1);

    const editorMutation = await request(app)
      .post("/regularize/process")
      .set("Authorization", `Bearer ${moduleToken}`)
      .send({});
    const legacyRead = await request(app)
      .get("/regularize/dashboard")
      .set("Authorization", `Bearer ${legacyToken}`);

    expect(editorMutation.status).toBe(400);
    expect(legacyRead.status).toBe(403);
  });
});
