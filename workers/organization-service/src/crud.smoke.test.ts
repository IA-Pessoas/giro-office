// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Nunca muda status/plano da organização semeada: as mutações usam organizações criadas aqui.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  SMOKE_JWT_SECRET,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { hashCsrfToken } from "../../runtime/src/session.js";
import { createOrganizationWorkerApp } from "./app.js";
import type { OrganizationWorkerEnv } from "./types.js";

/** CNPJ válido e único (dígitos verificadores calculados). */
function uniqueCnpj(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 10)}`.slice(-12).split("").map(Number);
  const digit = (digits: number[]) => {
    const weights =
      digits.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const rest = digits.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = [...base, digit(base)];
  return [...first, digit(first)].join("");
}

function encode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const input = `${encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${encode(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SMOKE_JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

/** Sessão de super_admin real (platform_users + platform_auth_sessions) e headers do gateway. */
async function platformHeaders(): Promise<Record<string, string>> {
  const csrf = "B".repeat(43);
  const csrfHash = await hashCsrfToken(csrf);
  const user = await smokeInsert("platform_users", {
    id: randomUUID(),
    name: "Smoke Super Admin",
    email: `smoke-platform-${randomUUID()}@smoke.local`,
    platform_role: "super_admin",
    status: "active",
    session_version: 0,
    updated_at: new Date(),
  });
  const session = await smokeInsert("platform_auth_sessions", {
    id: randomUUID(),
    platform_user_id: user.id,
    csrf_hash: csrfHash,
    // String ISO: o pg grava Date em hora local numa coluna sem fuso; o Worker lê em UTC.
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    revoked_at: null,
  });
  const token = await signJwt({
    user_id: user.id,
    auth_kind: "platform",
    platform_role: "super_admin",
    session_id: session.id,
    session_version: 0,
    csrf_hash: csrfHash,
  });
  return {
    cookie: `cw.session=${encodeURIComponent(token)}; cw.csrf=${csrf}`,
    "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
    "x-auth-user-id": String(user.id),
    "x-auth-kind": "platform",
    "x-auth-platform-role": "super_admin",
    "x-csrf-token": csrf,
    "content-type": "application/json",
  };
}

describe.skipIf(!smokeState)("organization-service CRUD smoke (banco real)", () => {
  const env = () => smokeEnv<OrganizationWorkerEnv>();
  const app = () => createOrganizationWorkerApp({ env: env() });

  it("rotas de organização: cria, lê, lista e atualiza logo/plano/status", async () => {
    const state = requireSmokeState();
    const headers = await smokeHeaders();
    const call = (method: string, path: string, body?: unknown) =>
      smokeCall(app(), env(), method, path, body, headers);

    // Seeded: só leitura.
    const seeded = expectOk(
      await call("GET", `/organizations/${state.organizationId}`),
      "GET seed",
    );
    expect(seeded.data.id).toBe(state.organizationId);

    // Payload de OrganizationAccessRequestForm.
    const name = `Smoke Org ${randomUUID().slice(0, 8)}`;
    const created = expectOk(
      await call("POST", "/organizations", {
        name,
        email_created_by: "smoke@smoke.local",
        cnpj: uniqueCnpj(),
      }),
      "POST /organizations",
    );
    const id = created.data.id as string;
    expect(created.data.slug).toBeTruthy();

    expect(
      expectOk(await call("GET", `/organizations/${id}`), "GET /organizations/:id").data.name,
    ).toBe(name);
    const list = expectOk(await call("GET", "/organizations?pageSize=100"), "GET /organizations");
    expect(list.data.organizations.some((org: { id: string }) => org.id === id)).toBe(true);
    expectOk(await call("GET", "/organizations/?status=active&page=1&pageSize=5"), "GET status");

    // useCurrentOrganizationMutations.
    const logo = "https://cdn.smoke.local/logo.png";
    expectOk(
      await call("PATCH", `/organizations/${id}/logo-url`, { logo_url: logo }),
      "PATCH logo",
    );
    expectOk(
      await call("PATCH", `/organizations/${id}/subscription-plan`, { subscription_plan: "pro" }),
      "PATCH plan",
    );
    expectOk(
      await call("PATCH", `/organizations/${id}/status`, { status: "suspended" }),
      "PATCH status",
    );
    const after = expectOk(await call("GET", `/organizations/${id}`), "GET após updates").data;
    expect(after).toMatchObject({ logo_url: logo, subscription_plan: "pro", status: "suspended" });
    expectOk(
      await call("PATCH", `/organizations/${id}/logo-url`, { logo_url: null }),
      "PATCH logo null",
    );
    expect(expectOk(await call("GET", `/organizations/${id}`), "GET").data.logo_url).toBeNull();
  });

  it("rotas de plataforma: cria com departamentos, lê, busca e atualiza com expected_updated_at", async () => {
    const headers = await platformHeaders();
    const call = (method: string, path: string, body?: unknown) =>
      smokeCall(app(), env(), method, path, body, headers);

    const name = `Smoke Plataforma ${randomUUID().slice(0, 8)}`;
    const created = expectOk(
      await call("POST", "/platform/organizations", { name, cnpj: uniqueCnpj() }),
      "POST /platform/organizations",
    );
    const id = created.data.id as string;

    let current = expectOk(await call("GET", `/platform/organizations/${id}`), "GET platform").data;
    expect(current.name).toBe(name);
    const search = expectOk(
      await call(
        "GET",
        `/platform/organizations?search=${encodeURIComponent(name)}&page=1&pageSize=20`,
      ),
      "GET /platform/organizations",
    );
    expect(search.data.organizations.map((org: { id: string }) => org.id)).toContain(id);
    expectOk(await call("GET", "/platform/organizations?status=active"), "GET platform status");

    current = expectOk(
      await call("PATCH", `/platform/organizations/${id}/status`, {
        status: "past_due",
        expected_updated_at: current.updated_at,
      }),
      "PATCH platform status",
    ).data;
    current = expectOk(
      await call("PATCH", `/platform/organizations/${id}/subscription-plan`, {
        subscription_plan: "enterprise",
        expected_updated_at: current.updated_at,
      }),
      "PATCH platform plan",
    ).data;
    const logo = "https://cdn.smoke.local/platform-logo.png";
    expectOk(
      await call("PATCH", `/platform/organizations/${id}/logo-url`, {
        logo_url: logo,
        expected_updated_at: current.updated_at,
      }),
      "PATCH platform logo",
    );
    const after = expectOk(await call("GET", `/platform/organizations/${id}`), "GET após").data;
    expect(after).toMatchObject({
      status: "past_due",
      subscription_plan: "enterprise",
      logo_url: logo,
    });

    // Concorrência otimista: updated_at velho vira 409, não 500.
    const stale = await call("PATCH", `/platform/organizations/${id}/status`, {
      status: "active",
      expected_updated_at: created.data.updated_at,
    });
    expect(stale.status).toBe(409);
  });
});
