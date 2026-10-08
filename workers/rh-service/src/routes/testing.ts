// Apoio aos testes das rotas: identidade repassada pelo gateway e um app com banco falso.
import { createRhWorkerApp } from "../app.js";
import type { RhWorkerEnv } from "../env.js";

export const TEST_USER_ID = "b0000000-0000-4000-8000-000000000001";
export const TEST_ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const TOKEN = "rh-gateway-token";

export function testEnv(overrides: Partial<RhWorkerEnv> = {}): RhWorkerEnv {
  return {
    JWT_SECRET: "rh-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
    ...overrides,
  };
}

/** `permission` é o nível RH repassado; `modules` sobrescreve o JSON de módulos. */
export function authHeaders(
  permission = 3,
  modules: Record<string, number> = { rh: permission },
): Record<string, string> {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": TEST_USER_ID,
    "x-auth-organization-id": TEST_ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-permission": String(permission),
    "x-auth-modules": JSON.stringify(modules),
  };
}

type TestApp = ReturnType<typeof createRhWorkerApp>;

/** App com `db` falso (objeto com os delegates usados pela rota). */
export function testApp(
  db: unknown,
  overrides: Partial<Parameters<typeof createRhWorkerApp>[0]> = {},
): TestApp {
  return createRhWorkerApp({ env: testEnv(), db: db as never, ...overrides });
}

export function call(
  app: TestApp,
  method: string,
  path: string,
  options: { permission?: number; modules?: Record<string, number>; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = authHeaders(options.permission ?? 3, options.modules);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  return Promise.resolve(app.request(`https://rh.test${path}`, { method, headers, body }));
}
