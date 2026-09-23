import { describe, expect, it, vi } from "vitest";

import { createPessoalWorkerApp } from "./app.js";
import type { PessoalWorkerEnv } from "./env.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const GROUP_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "f0000000-0000-4000-8000-000000000001";
const PREVIEW_ID = "30000000-0000-4000-8000-000000000003";
const TOKEN = "pessoal-internal-token";
const FINGERPRINT = "a".repeat(64);

function env(): PessoalWorkerEnv {
  return {
    JWT_SECRET: "pessoal-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "2"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-permission": permission,
  };
}

function groupAssignmentService() {
  return {
    listEligible: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 25, hasMore: false })),
    createPreview: vi.fn(async () => ({ preview_id: PREVIEW_ID })),
    detailPreview: vi.fn(async () => ({ preview_id: PREVIEW_ID })),
    apply: vi.fn(async () => ({
      preview_id: PREVIEW_ID,
      changed: 1,
      no_op: 0,
      skipped: 0,
      idempotent: false,
    })),
    reconcilePendingAuditEvents: vi.fn(async () => ({ processed: 1, pending: 0 })),
  };
}

describe("pessoal Worker - rotas restantes", () => {
  it("expõe as quatro rotas de atribuição em lote com o contexto e validação do contrato", async () => {
    const service = groupAssignmentService();
    const app = createPessoalWorkerApp({ env: env(), groupAssignmentService: service } as never);
    const authHeaders = headers();
    const jsonHeaders = { ...authHeaders, "content-type": "application/json" };

    const eligible = await app.request("https://pessoal.test/pessoal/group-assignments/eligible", {
      headers: authHeaders,
    });
    const preview = await app.request("https://pessoal.test/pessoal/group-assignments/previews", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ group_id: GROUP_ID, client_ids: [CLIENT_ID] }),
    });
    const detail = await app.request(
      `https://pessoal.test/pessoal/group-assignments/previews/${PREVIEW_ID}?page=1&limit=25`,
      { headers: authHeaders },
    );
    const apply = await app.request("https://pessoal.test/pessoal/group-assignments/apply", {
      method: "POST",
      headers: { ...jsonHeaders, "Idempotency-Key": "assignment-key" },
      body: JSON.stringify({ preview_id: PREVIEW_ID, fingerprint: FINGERPRINT }),
    });

    expect([eligible.status, preview.status, detail.status, apply.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(service.listEligible).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID, permission: 2 }),
      { page: 1, limit: 25 },
    );
    expect(service.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      { group_id: GROUP_ID, client_ids: [CLIENT_ID] },
    );
    expect(service.detailPreview).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      PREVIEW_ID,
      { page: 1, limit: 25 },
    );
    expect(service.apply).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, userId: USER_ID }),
      { preview_id: PREVIEW_ID, fingerprint: FINGERPRINT },
      "assignment-key",
    );
  });

  it("preserva permissão da leitura e rejeita aplicação sem idempotency key", async () => {
    const service = groupAssignmentService();
    const app = createPessoalWorkerApp({ env: env(), groupAssignmentService: service } as never);

    const denied = await app.request("https://pessoal.test/pessoal/group-assignments/eligible", {
      headers: headers("0"),
    });
    const invalid = await app.request("https://pessoal.test/pessoal/group-assignments/apply", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ preview_id: PREVIEW_ID, fingerprint: FINGERPRINT }),
    });

    expect(denied.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(service.listEligible).not.toHaveBeenCalled();
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("protege o reconcile da outbox por token interno e mantém o envelope", async () => {
    const service = groupAssignmentService();
    const app = createPessoalWorkerApp({ env: env(), groupAssignmentService: service } as never);

    const missing = await app.request(
      "https://pessoal.test/internal/pessoal/group-assignments/audit-outbox/reconcile",
      { method: "POST" },
    );
    const wrong = await app.request(
      "https://pessoal.test/internal/pessoal/group-assignments/audit-outbox/reconcile",
      { method: "POST", headers: { "x-internal-service-token": "wrong" } },
    );
    const valid = await app.request(
      "https://pessoal.test/internal/pessoal/group-assignments/audit-outbox/reconcile",
      { method: "POST", headers: { "x-internal-service-token": TOKEN } },
    );

    expect([missing.status, wrong.status, valid.status]).toEqual([401, 403, 200]);
    expect(await valid.json()).toEqual({
      success: true,
      data: { processed: 1, pending: 0 },
    });
    expect(service.reconcilePendingAuditEvents).toHaveBeenCalledOnce();
  });

  it("protege a notificação interna de sindicatos por token e passa a data atual", async () => {
    const notifications = {
      runForDate: vi.fn(async () => ({
        organizations: 1,
        unionsMatched: 1,
        notificationsCreated: 1,
        duplicatesSkipped: 0,
      })),
    };
    const app = createPessoalWorkerApp({
      env: env(),
      unionNotificationService: notifications,
    } as never);

    const missing = await app.request(
      "https://pessoal.test/internal/pessoal/union-notifications/run",
      {
        method: "POST",
      },
    );
    const wrong = await app.request(
      "https://pessoal.test/internal/pessoal/union-notifications/run",
      {
        method: "POST",
        headers: { "x-internal-service-token": "wrong" },
      },
    );
    const valid = await app.request(
      "https://pessoal.test/internal/pessoal/union-notifications/run",
      {
        method: "POST",
        headers: { "x-internal-service-token": TOKEN },
      },
    );

    expect([missing.status, wrong.status, valid.status]).toEqual([401, 403, 200]);
    expect(notifications.runForDate).toHaveBeenCalledWith({ now: expect.any(Date) });
    expect(await valid.json()).toEqual({
      success: true,
      data: { organizations: 1, unionsMatched: 1, notificationsCreated: 1, duplicatesSkipped: 0 },
    });
  });
});
