import { describe, expect, it, vi } from "vitest";
import { createProjectWorkerApp, type ProjectWorkerEnv } from "./app.js";

const TOKEN = "project-internal-token";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function env(): ProjectWorkerEnv {
  return {
    JWT_SECRET: "project-secret",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}
function headers(): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "x-auth-organization-id": ORG,
    "x-auth-kind": "organization",
    "x-auth-modules": JSON.stringify({ integracao: 2 }),
  };
}
function service() {
  return {
    list: vi.fn(async () => []),
    detail: vi.fn(async () => ({ detail: {} })),
    create: vi.fn(async () => ({ create: {} })),
  };
}

describe("project Worker", () => {
  it("returns health and ready", async () => {
    const app = createProjectWorkerApp({ env: env(), projectService: service() });
    expect((await app.request("https://project.test/health")).status).toBe(200);
    expect((await app.request("https://project.test/ready")).status).toBe(200);
  });
  it("requires auth and forwards organization scope", async () => {
    const projectService = service();
    const app = createProjectWorkerApp({ env: env(), projectService });
    expect(
      (
        await app.request(
          "https://project.test/project/list?ref=client&id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        )
      ).status,
    ).toBe(401);
    const response = await app.request(
      "https://project.test/project/list?ref=client&id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      { headers: headers() },
    );
    expect(response.status).toBe(200);
    expect(projectService.list).toHaveBeenCalledWith("client", expect.any(String), ORG);
  });
});
