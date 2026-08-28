import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { type CreateAuditRequestPayload, createAuditRecorder } from "@workspace/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { GatewayEnv } from "../config/env.js";
import { buildAuditCapacityGuard, buildAuditLifecycleMiddleware } from "../middlewares/audit.js";

const logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
const paths = [
  ["POST", "/platform/organizations", null, null],
  ["PATCH", "/platform/organizations/org-1/status", "org-1", null],
  ["PATCH", "/platform/organizations/org-1/subscription-plan", "org-1", null],
  ["PATCH", "/platform/organizations/org-1/logo-url", "org-1", null],
  ["PATCH", "/platform/organizations/org-1/users/user-1", "org-1", "user-1"],
  ["DELETE", "/platform/organizations/org-1/users/user-1", "org-1", "user-1"],
  ["POST", "/platform/organizations/org-1/users/user-1/reactivate", "org-1", "user-1"],
];

function fixture(fetchImpl: typeof fetch, maxInFlight = 1) {
  const recorder = createAuditRecorder({
    enabled: true,
    serviceUrl: "http://audit-service:3020",
    serviceToken: "secret-token",
    logger: logger as never,
    timeoutMs: 10,
    retryMaxAttempts: 1,
    maxInFlight,
    fetchImpl,
  });
  const guard = buildAuditCapacityGuard({ enabled: true, recordAuditRequest: recorder });
  const lifecycle = buildAuditLifecycleMiddleware({
    enabled: true,
    env: {} as GatewayEnv,
    logger: logger as never,
    recordAuditRequest: recorder,
  });
  function start(method = "POST", path = "/platform/organizations") {
    const request = {
      method,
      originalUrl: `${path}?token=query-secret`,
      path,
      requestId: "original-request-id",
      auth: { actorKind: "platform", userId: "platform-user-1", claims: {} },
      body: { cnpj: "11222333000181", logo_url: "https://secret.example/logo" },
      get: () => undefined,
      log: logger,
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      statusCode: 200,
      getHeader: () => undefined,
    });
    let upstreamCalls = 0;
    let error: unknown;
    lifecycle(request, response as unknown as Response, () => {});
    const pending = guard(request, response as unknown as Response, (failure?: unknown) => {
      error = failure;
      if (!failure) upstreamCalls += 1;
      response.statusCode = failure ? 503 : 200;
      response.writableEnded = true;
      response.emit("finish");
    });
    return { pending, response, upstreamCalls: () => upstreamCalls, error: () => error };
  }
  return { recorder, start };
}

describe("durable organization mutation audit barrier", () => {
  it("denied anonymous mutations cannot consume the protected audit quota", () => {
    const recorder = createAuditRecorder({
      enabled: true,
      serviceUrl: "http://audit-service:3020",
      serviceToken: "secret-token",
      logger: logger as never,
      maxInFlight: 1,
      protectedCapacity: 1,
      fetchImpl: async () => await new Promise<globalThis.Response>(() => {}),
    });
    const request = {
      method: "POST",
      originalUrl: "/platform/organizations",
      path: "/platform/organizations",
      requestId: "anonymous-request",
      get: () => undefined,
    } as unknown as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 401,
      getHeader: () => undefined,
    });
    buildAuditLifecycleMiddleware({
      enabled: true,
      env: {} as GatewayEnv,
      logger: logger as never,
      recordAuditRequest: recorder,
    })(request, response as unknown as Response, () => {});
    response.emit("finish");
    expect(recorder.reserve("protected")).toBe("protected");
  });

  it.each(
    paths,
  )("waits for ACK before %s %s with a distinct, safe attempt", async (method, path, organizationId, userId) => {
    const records: CreateAuditRequestPayload[] = [];
    let release!: (response: globalThis.Response) => void;
    const { start, recorder } = fixture(async (_input, init) => {
      records.push(JSON.parse(String(init?.body)));
      if (records.length === 1) {
        return await new Promise<globalThis.Response>((resolve) => {
          release = resolve;
        });
      }
      return new globalThis.Response(null, { status: 201 });
    });
    const operation = start(method, path);
    await Promise.resolve();
    expect(operation.upstreamCalls()).toBe(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: "organization.mutation.attempt",
      organizationId,
      userId,
      statusCode: null,
      outcome: "success",
      query: {},
      metadata: {
        actorKind: "platform",
        actorPlatformUserId: "platform-user-1",
        business_outcome: "unknown",
        source_request_id_sha256: createHash("sha256").update("original-request-id").digest("hex"),
      },
    });
    release(new globalThis.Response(null, { status: 201 }));
    await operation.pending;
    expect(operation.upstreamCalls()).toBe(1);
    await vi.waitFor(() => expect(records).toHaveLength(2));
    expect(records[0].requestId).not.toBe(records[1].requestId);
    expect(records[1].requestId).toBe("original-request-id");
    expect(records[1]).toMatchObject({ organizationId, userId });
    const serialized = JSON.stringify(records);
    for (const secret of ["query-secret", "11222333000181", "secret.example", "secret-token"]) {
      expect(serialized).not.toContain(secret);
    }
    await Promise.resolve();
    expect(recorder.reserve("protected")).toBe("protected");
    expect(recorder.reserve("protected")).toBeUndefined();
  });

  it.each([
    "network",
    "http",
    "timeout",
  ])("rejects %s without upstream and releases capacity", async (failure) => {
    let fail = true;
    const { start, recorder } = fixture(async (_input, init) => {
      if (!fail) return new globalThis.Response(null, { status: 201 });
      if (failure === "http") return new globalThis.Response("private-error", { status: 503 });
      if (failure === "timeout") {
        await new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      }
      throw new Error("private-error");
    });
    const operation = start();
    await operation.pending;
    expect(operation.upstreamCalls()).toBe(0);
    expect(operation.error()).toMatchObject({ statusCode: 503 });
    expect(String(operation.error())).not.toContain("private-error");
    await vi.waitFor(() => expect(recorder.reserve("protected")).toBe("protected"));
    fail = false;
    await recorder({ requestId: "release-check" } as never, "protected");
    const retry = start();
    await retry.pending;
    expect(retry.upstreamCalls()).toBe(1);
  });

  it("never starts upstream after close during ACK and does not double-release capacity", async () => {
    let release!: (response: globalThis.Response) => void;
    let signal: AbortSignal | undefined;
    const { start, recorder } = fixture(async (_input, init) => {
      signal = init?.signal ?? undefined;
      // Even a transport that returns an ACK after abort must not dispatch the mutation.
      return await new Promise<globalThis.Response>((resolve) => {
        release = resolve;
      });
    });
    const operation = start();
    await Promise.resolve();
    expect(operation.upstreamCalls()).toBe(0);
    operation.response.destroyed = true;
    operation.response.emit("close");
    expect(signal?.aborted).toBe(true);
    release(new globalThis.Response(null, { status: 201 }));
    await operation.pending;
    expect(operation.upstreamCalls()).toBe(0);
    expect(recorder.reserve("protected")).toBe("protected");
    expect(recorder.reserve("protected")).toBeUndefined();
  });
});
