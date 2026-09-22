import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTaskApp } from "./app.js";
import { runInTaskContext } from "./context.js";
import type { TaskWorkerEnv } from "./env.js";
import { signJwt, TOKENS, workerEnv } from "./test/env.js";

/** Prisma falso: todo model responde vazio e grava a chamada. */
function fakePrisma() {
  const calls: string[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async () => {
          calls.push(`${name}.${method}`);
          return method === "count" ? 0 : method.startsWith("findMany") ? [] : null;
        },
      },
    );
  const client = new Proxy({ $disconnect: async () => {} } as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      if (prop === "$transaction")
        return async (arg: unknown) =>
          typeof arg === "function" ? arg(client) : Promise.all(arg as unknown[]);
      return model(prop);
    },
  });
  return { client, calls };
}

let server: Server | undefined;

async function serve(env: TaskWorkerEnv = workerEnv()) {
  const prisma = fakePrisma();
  const createPrisma = vi.fn(() => prisma.client as never);
  server = createServer((req, res) => {
    void runInTaskContext(
      { env, createPrisma },
      () =>
        new Promise<void>((resolve) => {
          res.on("close", resolve);
          getTaskApp()(req, res);
        }),
    );
  });
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, prisma, createPrisma };
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

const forwarded = {
  "x-internal-service-token": TOKENS.internal,
  "x-auth-user-id": "user-1",
  "x-auth-organization-id": "org-1",
  "x-auth-type": "owner",
};

describe("task-worker app", () => {
  it("responde /health com o envelope do Node", async () => {
    const { base } = await serve();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: "ok", service: "task-service" },
    });
  });

  it("recusa /task sem credencial", async () => {
    const { base, createPrisma } = await serve();
    const response = await fetch(`${base}/task/list`);
    expect(response.status).toBe(401);
    expect(createPrisma).not.toHaveBeenCalled();
  });

  it("recusa o contexto encaminhado com token interno errado", async () => {
    const { base } = await serve();
    const response = await fetch(`${base}/task/list`, {
      headers: { ...forwarded, "x-internal-service-token": TOKENS.audit },
    });
    expect(response.status).toBe(401);
  });

  it("aceita o contexto encaminhado pelo gateway e chega ao banco da organização", async () => {
    const { base, prisma } = await serve();
    const response = await fetch(`${base}/task/list`, { headers: forwarded });
    expect(response.status).toBe(200);
    expect(prisma.calls.some((call) => call.startsWith("task."))).toBe(true);
  });

  it("aceita Bearer JWT", async () => {
    const { base, prisma } = await serve();
    const token = signJwt({ user_id: "user-1", organization_id: "org-1", type: "owner" });
    const response = await fetch(`${base}/task/list`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(prisma.calls.some((call) => call.startsWith("task."))).toBe(true);
  });

  it("recusa mutação por cookie de sessão sem CSRF", async () => {
    const { base } = await serve();
    const token = signJwt({ user_id: "user-1", organization_id: "org-1", type: "owner" });
    const response = await fetch(`${base}/task`, {
      method: "POST",
      headers: { cookie: `cw.session=${token}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });

  it("protege a rota interna do commercial pelo token de serviço", async () => {
    const { base } = await serve();
    const response = await fetch(`${base}/internal/commercial/task-billing`, {
      method: "POST",
      headers: { "x-internal-service-token": "outro", "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });
});
