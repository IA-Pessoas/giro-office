import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared/http";
import { describe, expect, it, vi } from "vitest";
import { createGatewayWorkerApp } from "./app.js";
import type { GatewayWorkerEnv } from "./env.js";

const SECRET = "gateway-worker-task-secret-with-enough-length";
const TOKEN = "gateway-internal-token";

function setup() {
  const task = {
    fetch: vi.fn(async (_request: Request) => Response.json({ success: true, data: [] })),
  };
  const audit = { fetch: vi.fn(async () => new Response(null, { status: 201 })) };
  const app = createGatewayWorkerApp({
    env: {
      JWT_SECRET: SECRET,
      INTERNAL_SERVICE_TOKEN: TOKEN,
      AUDIT_SERVICE_TOKEN: "gateway-audit-token",
      AUDIT_SERVICE: audit,
      TASK_SERVICE: task,
    } as GatewayWorkerEnv,
  });
  return { app, task };
}

async function bearer(modules: Record<string, number>): Promise<string> {
  const encode = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");
  const input = `${encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${encode(
    JSON.stringify({
      user_id: "user-1",
      organization_id: "org-1",
      auth_kind: "organization",
      type: "user",
      permission: 1,
      modules,
    }),
  )}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `Bearer ${input}.${encode(new Uint8Array(signature))}`;
}

describe("gateway Worker: /task → TASK_SERVICE", () => {
  it.each([
    ["GET", "/task/list"],
    ["GET", "/task/notifications"],
    ["GET", "/task/model/list"],
    ["GET", "/task/project-plan/list"],
    ["GET", "/task/financeiro/queue"],
    ["POST", "/task/project-wizard/preview"],
  ] as const)("%s %s chega ao task-service com a identidade repassada", async (method, path) => {
    const { app, task } = setup();

    const response = await app.request(`https://gateway.test${path}`, {
      method,
      headers: { authorization: await bearer({ integracao: 3, financeiro: 3 }) },
    });

    expect(response.status).toBe(200);
    const forwarded = task.fetch.mock.calls[0][0];
    expect(new URL(forwarded.url).pathname).toBe(path);
    expect(forwarded.headers.get(INTERNAL_SERVICE_TOKEN_HEADER)).toBe(TOKEN);
    expect(forwarded.headers.get(FORWARDED_AUTH_USER_ID_HEADER)).toBe("user-1");
    expect(forwarded.headers.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER)).toBe("org-1");
    expect(JSON.parse(forwarded.headers.get(FORWARDED_AUTH_MODULES_HEADER) ?? "{}")).toMatchObject({
      integracao: 3,
    });
  });

  it("aplica a policy do Node: mutação de tarefa exige nível de edição em integração", async () => {
    const { app, task } = setup();

    const response = await app.request("https://gateway.test/task", {
      method: "DELETE",
      headers: { authorization: await bearer({ integracao: 1 }) },
    });

    expect(response.status).toBe(403);
    expect(task.fetch).not.toHaveBeenCalled();
  });

  it("não expõe as rotas internas do task-service", async () => {
    const { app, task } = setup();

    const response = await app.request("https://gateway.test/internal/commercial/task-billing", {
      method: "POST",
      headers: { authorization: await bearer({ integracao: 3 }) },
    });

    expect(response.status).toBe(404);
    expect(task.fetch).not.toHaveBeenCalled();
  });
});
