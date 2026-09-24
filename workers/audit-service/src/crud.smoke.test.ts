// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  SMOKE_INTERNAL_TOKEN,
  smokeCall,
  smokeEnv,
  smokeHeaders,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { type AuditWorkerEnv, createAuditWorkerApp } from "./app.js";

describe.skipIf(!smokeState)("audit-service CRUD smoke (banco real)", () => {
  const env = () => smokeEnv<AuditWorkerEnv>({ AUDIT_ENABLED: "true" });
  const app = () => createAuditWorkerApp({ env: env() });

  it("grava pelo endpoint interno e busca por organização, plataforma e requestId", async () => {
    const state = requireSmokeState();
    const requestId = randomUUID();
    const referringId = randomUUID();
    const now = new Date().toISOString();

    // Mesmo corpo que os Workers mandam (ex.: createAuditRecorder do organization-service).
    const internal = {
      "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
      "content-type": "application/json",
    };
    const payload = {
      requestId,
      organizationId: state.organizationId,
      userId: state.ownerId,
      permission: 3,
      method: "put",
      path: "/task/smoke",
      query: { page: "1", tags: ["a", "b"] },
      statusCode: 200,
      outcome: "success",
      durationMs: 12,
      ip: "127.0.0.1",
      userAgent: "crud-smoke",
      origin: "https://smoke.local",
      serviceSource: "task-service",
      createdAt: now,
      finishedAt: now,
      metadata: { smoke: true },
      action: "task.updated",
      referring: "task",
      referringId,
      changes: JSON.stringify({ name: { from: "a", to: "b" } }),
      department: "Tecnologia",
    };
    const created = expectOk(
      await smokeCall(app(), env(), "POST", "/internal/audit/requests", payload, internal),
      "POST /internal/audit/requests",
    );
    expect(created.data.requestId).toBe(requestId);
    // Idempotente (upsert por request_id).
    expectOk(
      await smokeCall(app(), env(), "POST", "/internal/audit/requests", payload, internal),
      "POST repetido",
    );
    // Evento de plataforma sem usuário (organization-service).
    expectOk(
      await smokeCall(
        app(),
        env(),
        "POST",
        "/internal/audit/requests",
        {
          requestId: randomUUID(),
          organizationId: state.organizationId,
          userId: null,
          method: "ENTITY_CHANGE",
          path: `/platform/organizations/${state.organizationId}`,
          outcome: "success",
          serviceSource: "organization-service",
          createdAt: now,
          finishedAt: now,
          metadata: { actorPlatformUserId: randomUUID() },
          action: "organization.status.updated",
          referring: "organization",
          referringId: state.organizationId,
          changes: { status: { from: "active", to: "active" } },
        },
        internal,
      ),
      "POST evento de plataforma",
    );

    // LogDrawer: referring + referringId + page/pageSize.
    const org = await smokeHeaders();
    const search = expectOk(
      await smokeCall(
        app(),
        env(),
        "GET",
        `/audit/requests?referring=task&referringId=${referringId}&page=1&pageSize=20`,
        undefined,
        org,
      ),
      "GET /audit/requests",
    );
    expect(search.data.items).toHaveLength(1);
    expect(search.data.items[0]).toMatchObject({
      requestId,
      method: "PUT",
      department: "Tecnologia",
      changes: { name: { from: "a", to: "b" } },
      query: { page: "1", tags: ["a", "b"] },
    });
    expectOk(
      await smokeCall(
        app(),
        env(),
        "GET",
        `/audit/requests?method=put&path=smoke&statusCode=200&userId=${state.ownerId}&dateFrom=2020-01-01T00:00:00.000Z&department=Tecnologia`,
        undefined,
        org,
      ),
      "GET /audit/requests filtros",
    );

    const item = expectOk(
      await smokeCall(app(), env(), "GET", `/audit/requests/${requestId}`, undefined, org),
      "GET /audit/requests/:requestId",
    );
    expect(item.data.item.referringId).toBe(referringId);

    // platformService.searchAudit: super_admin sem organização/permissão no header.
    const platform = {
      "x-internal-service-token": SMOKE_INTERNAL_TOKEN,
      "x-auth-user-id": randomUUID(),
      "x-auth-kind": "platform",
      "x-auth-platform-role": "super_admin",
    };
    const platformSearch = expectOk(
      await smokeCall(
        app(),
        env(),
        "GET",
        `/audit/requests?page=1&pageSize=20&path=/task/smoke&organizationId=${state.organizationId}`,
        undefined,
        platform,
      ),
      "GET /audit/requests (plataforma)",
    );
    expect(platformSearch.data.items.map((row: { requestId: string }) => row.requestId)).toContain(
      requestId,
    );
    expect(platformSearch.data.items[0].organizationName).toBeTruthy();
  });

  // Achado: o gateway manda userId = id do platform_users em requisições de super_admin, mas
  // audit_requests.user_id tem FK para users (audit_requests_user_id_fkey) e o upsert dá 500.
  // audit_requests.user_id tem FK para users: o gateway manda userId null para super_admin
  // e o id de platform_users em metadata.platformUserId (workers/gateway/src/app.ts).
  it("aceita evento de super_admin no formato do gateway", async () => {
    const result = await smokeCall(
      app(),
      env(),
      "POST",
      "/internal/audit/requests",
      {
        requestId: randomUUID(),
        userId: null,
        method: "GET",
        path: "/platform/organizations",
        serviceSource: "gateway-worker",
        createdAt: new Date().toISOString(),
        metadata: { actorKind: "platform", platformUserId: randomUUID() },
      },
      { "x-internal-service-token": SMOKE_INTERNAL_TOKEN, "content-type": "application/json" },
    );
    expectOk(result, "POST com userId de plataforma");
  });
});
