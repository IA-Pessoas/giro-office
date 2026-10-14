import "./envBootstrap.js";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPrismaMock, createTestApp } from "./tiServiceTestUtils.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
const targetUserId = "00000000-0000-4000-8000-000000000002";

function gatewayHeaders(permission: number): Record<string, string> {
  return {
    [FORWARDED_AUTH_USER_ID_HEADER]: userId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: String(permission),
    [INTERNAL_SERVICE_TOKEN_HEADER]: "ti-service-internal-token-test",
  };
}

function appWith(answers: unknown[][]) {
  const prisma = createPrismaMock();
  const $queryRaw = vi.fn(async (..._args: unknown[]) => answers.shift() ?? []);
  const $executeRaw = vi.fn(async (..._args: unknown[]) => 1);
  const db = { $queryRaw, $executeRaw };
  Object.assign(prisma, {
    ...db,
    $transaction: vi.fn(async (callback: (database: unknown) => Promise<unknown>) =>
      callback({ ...db, $transaction: vi.fn() }),
    ),
  });
  return { app: createTestApp(prisma), $queryRaw, $executeRaw };
}

describe("ti specific access routes", () => {
  it("only TI admins list, grant or revoke specific accesses, even if the UI hides it", async () => {
    const { app, $queryRaw, $executeRaw } = appWith([]);

    for (const permission of [1, 2]) {
      const list = await request(app)
        .get("/ti/specific-accesses/list")
        .set(gatewayHeaders(permission));
      const update = await request(app)
        .patch(`/ti/specific-accesses/${targetUserId}`)
        .set(gatewayHeaders(permission))
        .send({ task_completion: true });
      expect(list.status).toBe(403);
      expect(update.status).toBe(403);
    }
    expect($queryRaw).not.toHaveBeenCalled();
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it("refuses a user without the TI module", async () => {
    const { app, $queryRaw } = appWith([]);
    const headers = gatewayHeaders(0);

    const response = await request(app).get("/ti/specific-accesses/list").set(headers);

    expect(response.status).toBe(403);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("validates the user id and the body", async () => {
    const { app, $executeRaw } = appWith([]);

    for (const [path, body] of [
      ["/ti/specific-accesses/nao-e-uuid", { task_completion: true }],
      [`/ti/specific-accesses/${targetUserId}`, { task_completion: "sim" }],
      [`/ti/specific-accesses/${targetUserId}`, { task_completion: true, regime_change: true }],
    ] as const) {
      const response = await request(app).patch(path).set(gatewayHeaders(3)).send(body);
      expect(response.status).toBe(400);
    }
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it("grants task completion for a TI admin", async () => {
    const granted = {
      id: targetUserId,
      name: "Ana",
      full_name: null,
      department: "Integração",
      task_completion: true,
    };
    const { app, $executeRaw } = appWith([
      [{ id: targetUserId, task_completion: false, specific_organization_id: null }],
      [granted],
    ]);

    const response = await request(app)
      .patch(`/ti/specific-accesses/${targetUserId}`)
      .set(gatewayHeaders(3))
      .send({ task_completion: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: granted });
    expect($executeRaw).toHaveBeenCalledTimes(2);
  });
});
